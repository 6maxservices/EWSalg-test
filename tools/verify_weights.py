"""Record or verify SHA-256 hashes for existing local model weights."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any


WEIGHT_SUFFIXES = {".safetensors", ".bin", ".pt", ".pth", ".gguf", ".model", ".json"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def files_under(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in WEIGHT_SUFFIXES)


def record(root: Path) -> dict[str, Any]:
    files = files_under(root)
    if not files:
        raise ValueError("No model/weight files found")
    return {
        "schema_version": 1,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "root_name": root.name,
        "files": [
            {"path": path.relative_to(root).as_posix(), "size": path.stat().st_size, "sha256": sha256(path)}
            for path in files
        ],
    }


def verify(root: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    expected = {item["path"]: item for item in manifest.get("files", [])}
    actual_paths = {path.relative_to(root).as_posix(): path for path in files_under(root)}
    missing = sorted(set(expected) - set(actual_paths))
    unexpected = sorted(set(actual_paths) - set(expected))
    changed = sorted(
        relative
        for relative in set(expected) & set(actual_paths)
        if expected[relative].get("size") != actual_paths[relative].stat().st_size
        or expected[relative].get("sha256") != sha256(actual_paths[relative])
    )
    return {
        "status": "PASS" if not (missing or unexpected or changed) else "FAIL",
        "missing": missing,
        "unexpected": unexpected,
        "changed": changed,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    record_parser = commands.add_parser("record")
    record_parser.add_argument("--path", type=Path, required=True)
    record_parser.add_argument("--manifest", type=Path, default=Path("var/model-weights.json"))
    verify_parser = commands.add_parser("verify")
    verify_parser.add_argument("--path", type=Path, required=True)
    verify_parser.add_argument("--manifest", type=Path, default=Path("var/model-weights.json"))
    args = parser.parse_args()
    try:
        if args.command == "record":
            result = record(args.path)
            args.manifest.parent.mkdir(parents=True, exist_ok=True)
            args.manifest.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
            print(f"Recorded {len(result['files'])} files in {args.manifest}")
            return 0
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        result = verify(args.path, manifest)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "FAIL", "error": type(exc).__name__}))
        return 2
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
