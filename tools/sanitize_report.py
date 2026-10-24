"""Convert audit output into a minimal export-safe report."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
from pathlib import Path
import re
import tempfile
from typing import Any, Iterable

from security_gateway.policy import DlpPolicy, PolicyError, deep_replace


URL_PATTERN = re.compile(r"https?://[^\s<>]+", re.IGNORECASE)
PATH_PATTERN = re.compile(
    r"(?P<path>(?:[A-Za-z]:[\\/]|\.\.?[\\/])(?:[^\s:'\"<>|]+[\\/])*[^\s:'\"<>|]+|/(?:[^/\s:'\"<>|]+/)*[^/\s:'\"<>|]+)"
)
QUOTED_LITERAL = re.compile(r"(['\"])(?:(?!\1).){4,}\1")
CODE_LINE = re.compile(
    r"^(?://|#|(?:async\s+)?(?:def|class|function|import|from|const|let|var)\b|[A-Za-z_$][\w$]*\s*=)|(?:=>|[{};])\s*$"
)


class SanitizationError(RuntimeError):
    """Raised before any unsafe output is written."""


@dataclass
class PathMapper:
    """Persistent deterministic path aliases stored only in a local ignored file."""

    path: Path
    values: dict[str, str]

    @classmethod
    def load(cls, path: Path) -> "PathMapper":
        if path.is_file():
            value = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(value, dict):
                raise SanitizationError("Path mapping must be a JSON object")
            return cls(path, {str(key): str(alias) for key, alias in value.items()})
        return cls(path, {})

    def alias(self, source: str) -> str:
        normalized = source.replace("\\", "/")
        if normalized not in self.values:
            suffix = Path(normalized).suffix.lower() or ".txt"
            self.values[normalized] = f"src/module_A/file_{len(self.values) + 1:03d}{suffix}"
        return self.values[normalized]

    def replace_paths(self, text: str) -> str:
        return PATH_PATTERN.sub(lambda match: self.alias(match.group("path")), text)

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.values, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def detect_format(raw: str, requested: str) -> tuple[str, Any]:
    if requested == "text":
        return "text", raw
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        if requested in {"json", "sarif"}:
            raise SanitizationError(f"Input is not valid {requested.upper()}")
        return "text", raw
    if requested == "sarif" or (isinstance(value, dict) and "runs" in value and "$schema" in value):
        return "sarif", value
    return "json", value


def _severity(value: Any) -> str:
    normalized = str(value or "unknown").lower()
    aliases = {"error": "high", "warning": "medium", "note": "low", "info": "low"}
    return aliases.get(normalized, normalized)


class ReportSanitizer:
    """Normalize supported audit formats and remove identifying detail."""

    def __init__(
        self,
        policy: DlpPolicy,
        path_mapper: PathMapper,
        library_categories: dict[str, str] | None = None,
    ) -> None:
        self.policy = policy
        self.path_mapper = path_mapper
        self.library_categories = library_categories or {}

    def _text(self, value: Any, *, limit: int = 500) -> str:
        text = str(value or "")
        text = URL_PATTERN.sub("<external-url>", text)
        text = self.path_mapper.replace_paths(text)
        text = deep_replace(text, self.policy.aliases)
        text = deep_replace(text, self.library_categories)
        text = QUOTED_LITERAL.sub("<literal>", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:limit]

    def _finding(
        self,
        *,
        kind: Any,
        severity: Any,
        description: Any,
        location: Any = "",
        rule_id: Any = "",
        cwe: Any = "",
    ) -> dict[str, str]:
        return {
            "type": self._text(kind, limit=100) or "audit-finding",
            "severity": _severity(severity),
            "rule_id": self._text(rule_id, limit=100),
            "cwe": self._text(cwe, limit=100),
            "location": self._text(location, limit=200),
            "description": self._text(description),
        }

    def _sarif(self, value: dict[str, Any]) -> Iterable[dict[str, str]]:
        for run in value.get("runs", []):
            for result in run.get("results", []):
                message = result.get("message", {}).get("text", "")
                locations = result.get("locations", [])
                uri = ""
                if locations:
                    uri = locations[0].get("physicalLocation", {}).get("artifactLocation", {}).get("uri", "")
                yield self._finding(
                    kind="static-analysis",
                    severity=result.get("level", "unknown"),
                    rule_id=result.get("ruleId", ""),
                    description=message,
                    location=uri,
                )

    def _json(self, value: Any) -> Iterable[dict[str, str]]:
        if isinstance(value, dict) and isinstance(value.get("results"), list):
            for item in value["results"]:
                if not isinstance(item, dict):
                    continue
                cwe = item.get("issue_cwe", {})
                if isinstance(cwe, dict):
                    cwe = cwe.get("id", "")
                extra = item.get("extra", {}) if isinstance(item.get("extra"), dict) else {}
                yield self._finding(
                    kind=item.get("type", item.get("test_name", "static-analysis")),
                    severity=item.get("severity", item.get("issue_severity", extra.get("severity", "unknown"))),
                    rule_id=item.get("rule_id", item.get("test_id", item.get("check_id", ""))),
                    cwe=cwe,
                    description=item.get("message", item.get("issue_text", extra.get("message", "finding"))),
                    location=item.get("path", item.get("filename", "")),
                )
            return
        if isinstance(value, dict) and isinstance(value.get("dependencies"), list):
            for dependency in value["dependencies"]:
                if not isinstance(dependency, dict):
                    continue
                for vulnerability in dependency.get("vulns", []):
                    yield self._finding(
                        kind="dependency-vulnerability",
                        severity=vulnerability.get("severity", "unknown"),
                        rule_id=vulnerability.get("id", ""),
                        description=vulnerability.get("description", "Known dependency vulnerability"),
                    )
            return
        items = value if isinstance(value, list) else [value]
        for item in items:
            if isinstance(item, dict):
                yield self._finding(
                    kind=item.get("type", "audit-finding"),
                    severity=item.get("severity", "unknown"),
                    rule_id=item.get("rule_id", item.get("id", "")),
                    description=item.get("description", item.get("message", "finding")),
                    location=item.get("path", item.get("file", "")),
                )

    def _plain_text(self, value: str) -> Iterable[dict[str, str]]:
        for line in value.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if line.startswith(("    ", "\t", "E   ", "> ")) or CODE_LINE.search(stripped):
                continue
            yield self._finding(kind="tool-output", severity="unknown", description=stripped)

    def sanitize(self, source_format: str, value: Any) -> dict[str, Any]:
        if source_format == "sarif":
            findings = list(self._sarif(value))
        elif source_format == "json":
            findings = list(self._json(value))
        else:
            findings = list(self._plain_text(value))
        result = {
            "schema_version": 1,
            "source_format": source_format,
            "finding_count": len(findings),
            "findings": findings,
        }
        try:
            self.policy.assert_export_safe(result)
        except PolicyError as exc:
            raise SanitizationError(str(exc)) from exc
        return result


def _load_string_map(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in value.items()):
        raise SanitizationError(f"{path} must contain a string-to-string JSON object")
    return value


def write_atomic(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--format", choices=("auto", "json", "sarif", "text"), default="auto")
    parser.add_argument("--blocklist", type=Path, default=Path("config/blocklist.txt"))
    parser.add_argument("--aliases", type=Path, default=Path("config/aliases.json"))
    parser.add_argument("--libraries", type=Path, default=Path("config/library_categories.json"))
    parser.add_argument("--mapping", type=Path, default=Path("var/sanitizer/path_mapping.json"))
    return parser


def main() -> int:
    args = build_parser().parse_args()
    raw = args.input.read_text(encoding="utf-8", errors="replace")
    source_format, parsed = detect_format(raw, args.format)
    policy = DlpPolicy(args.blocklist, args.aliases)
    mapper = PathMapper.load(args.mapping)
    sanitizer = ReportSanitizer(policy, mapper, _load_string_map(args.libraries))
    try:
        result = sanitizer.sanitize(source_format, parsed)
    except (PolicyError, SanitizationError, json.JSONDecodeError) as exc:
        print(f"Sanitization failed: {exc}")
        return 2
    write_atomic(args.output, result)
    mapper.save()
    print(f"Wrote {result['finding_count']} sanitized findings to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
