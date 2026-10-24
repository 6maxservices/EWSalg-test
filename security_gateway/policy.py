"""DLP blocklist and reversible alias handling."""

from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import re
from typing import Any


class PolicyError(RuntimeError):
    """Raised when a public request cannot safely leave the machine."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def collect_text(value: Any) -> str:
    """Collect every string in a JSON-compatible value for hashing/scanning."""

    parts: list[str] = []

    def visit(item: Any) -> None:
        if isinstance(item, str):
            parts.append(item)
        elif isinstance(item, dict):
            for key, child in item.items():
                parts.append(str(key))
                visit(child)
        elif isinstance(item, list):
            for child in item:
                visit(child)

    visit(value)
    return "\n".join(parts)


def deep_replace(value: Any, replacements: dict[str, str]) -> Any:
    """Return a deep copy with literal replacements applied to all strings."""

    if not replacements:
        return deepcopy(value)
    ordered = sorted(replacements.items(), key=lambda pair: len(pair[0]), reverse=True)

    def replace(item: Any) -> Any:
        if isinstance(item, str):
            result = item
            for source, target in ordered:
                result = result.replace(source, target)
            return result
        if isinstance(item, list):
            return [replace(child) for child in item]
        if isinstance(item, dict):
            return {key: replace(child) for key, child in item.items()}
        return item

    return replace(value)


class DlpPolicy:
    """Fail-closed policy for public routes."""

    def __init__(self, blocklist_path: Path, aliases_path: Path) -> None:
        self.blocklist_path = blocklist_path
        self.aliases_path = aliases_path
        self.patterns = self._load_patterns(blocklist_path)
        self.aliases = self._load_aliases(aliases_path)

    @staticmethod
    def _load_patterns(path: Path) -> list[re.Pattern[str]]:
        if not path.is_file():
            return []
        patterns: list[re.Pattern[str]] = []
        for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            value = raw.strip()
            if not value or value.startswith("#"):
                continue
            try:
                patterns.append(re.compile(value, re.IGNORECASE | re.MULTILINE))
            except re.error as exc:
                raise PolicyError(
                    "invalid_blocklist",
                    f"Invalid blocklist expression at line {line_number}: {exc}",
                ) from exc
        return patterns

    @staticmethod
    def _load_aliases(path: Path) -> dict[str, str]:
        if not path.is_file():
            return {}
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict) or not all(
            isinstance(key, str) and isinstance(alias, str) and key and alias
            for key, alias in value.items()
        ):
            raise PolicyError("invalid_aliases", "aliases.json must contain string-to-string pairs")
        if len(set(value.values())) != len(value):
            raise PolicyError("invalid_aliases", "Alias values must be unique for safe reversal")
        return value

    def prepare_public_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Scan the original request, then pseudonymize a safe copy."""

        if not self.blocklist_path.is_file():
            raise PolicyError("blocklist_missing", "Public routes are disabled until blocklist.txt exists")
        text = collect_text(payload)
        if any(pattern.search(text) for pattern in self.patterns):
            raise PolicyError("dlp_block", "Request blocked by the local DLP policy")
        return deep_replace(payload, self.aliases)

    def restore_public_response(self, response: dict[str, Any]) -> dict[str, Any]:
        """Reverse configured aliases in a provider response."""

        reverse = {alias: source for source, alias in self.aliases.items()}
        return deep_replace(response, reverse)

    def assert_export_safe(self, value: Any) -> None:
        """Fail when sanitized output still contains a blocklisted expression."""

        if not self.blocklist_path.is_file():
            raise PolicyError("blocklist_missing", "Sanitization requires an existing blocklist.txt")
        text = collect_text(value)
        if any(pattern.search(text) for pattern in self.patterns):
            raise PolicyError("dlp_block", "Sanitized output still violates the DLP policy")
