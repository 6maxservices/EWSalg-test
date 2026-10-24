"""Minimal non-interpolating .env loader for local startup."""

from __future__ import annotations

import os
from pathlib import Path


def load_env_file(path: Path) -> None:
    """Load KEY=VALUE lines without overwriting the process environment."""

    if not path.is_file():
        return
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        value = raw.strip()
        if not value or value.startswith("#"):
            continue
        if "=" not in value:
            raise ValueError(f"Invalid .env entry at line {line_number}")
        key, content = value.split("=", 1)
        key = key.strip()
        content = content.strip()
        if not key or not key.replace("_", "").isalnum() or key[0].isdigit():
            raise ValueError(f"Invalid .env key at line {line_number}")
        if len(content) >= 2 and content[0] == content[-1] and content[0] in {"'", '"'}:
            content = content[1:-1]
        os.environ.setdefault(key, content)
