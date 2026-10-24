"""Append-only, hash-chained evidence and design-decision log."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import date, datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Iterable
import uuid
import time


ZERO_HASH = "0" * 64


class EvidenceError(RuntimeError):
    """Raised when an evidence chain is invalid or an entry is malformed."""


def _canonical(value: dict[str, Any]) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _parse_date(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise EvidenceError("Dates must use YYYY-MM-DD") from exc


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_chain(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    entries: list[dict[str, Any]] = []
    previous = ZERO_HASH
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw.strip():
            continue
        try:
            entry = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise EvidenceError(f"Invalid JSON at {path}:{line_number}") from exc
        claimed = entry.pop("entry_hash", None)
        if entry.get("prev_hash") != previous:
            raise EvidenceError(f"Broken previous-hash link at {path}:{line_number}")
        calculated = hashlib.sha256(previous.encode("ascii") + _canonical(entry)).hexdigest()
        if claimed != calculated:
            raise EvidenceError(f"Hash mismatch at {path}:{line_number}")
        entry["entry_hash"] = claimed
        entries.append(entry)
        previous = claimed
    return entries


@contextmanager
def _exclusive_lock(path: Path):
    lock_path = path.with_suffix(path.suffix + ".lock")
    deadline = time.monotonic() + 5
    descriptor: int | None = None
    while descriptor is None:
        try:
            lock_path.parent.mkdir(parents=True, exist_ok=True)
            descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.write(descriptor, f"pid={os.getpid()}\n".encode("ascii"))
        except FileExistsError:
            if time.monotonic() >= deadline:
                raise EvidenceError(f"Evidence log is locked: {lock_path}")
            time.sleep(0.05)
    try:
        yield
    finally:
        os.close(descriptor)
        lock_path.unlink(missing_ok=True)


def append_entry(path: Path, entry: dict[str, Any]) -> dict[str, Any]:
    """Verify the current chain and append one complete JSON line."""

    with _exclusive_lock(path):
        existing = read_chain(path)
        previous = existing[-1]["entry_hash"] if existing else ZERO_HASH
        value = dict(entry)
        value["prev_hash"] = previous
        value["entry_hash"] = hashlib.sha256(previous.encode("ascii") + _canonical(value)).hexdigest()
        raw = (json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor = os.open(path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o600)
        try:
            os.write(descriptor, raw)
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    return value


def _base(kind: str, effective_date: str) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "id": str(uuid.uuid4()),
        "kind": kind,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "effective_date": _parse_date(effective_date),
    }


def add_measure(
    root: Path,
    name: str,
    version: str,
    effective_date: str,
    configs: Iterable[Path],
    notes: str,
) -> dict[str, Any]:
    config_hashes: list[dict[str, str]] = []
    for config in configs:
        if not config.is_file():
            raise EvidenceError(f"Config does not exist: {config}")
        try:
            display_path = config.resolve().relative_to(root.parent.resolve()).as_posix()
        except ValueError:
            display_path = config.name
        config_hashes.append({"path": display_path, "sha256": hash_file(config)})
    entry = _base("measure", effective_date)
    entry.update(
        {
            "name": name.strip(),
            "version": version.strip(),
            "config_hashes": config_hashes,
            "notes": notes.strip(),
        }
    )
    if not entry["name"] or not entry["version"]:
        raise EvidenceError("Measure name and version are required")
    return append_entry(root / "measures.jsonl", entry)


def add_decision(root: Path, decision: str, rationale: str, effective_date: str) -> dict[str, Any]:
    entry = _base("decision", effective_date)
    entry.update({"decision": decision.strip(), "rationale": rationale.strip()})
    if not entry["decision"] or not entry["rationale"]:
        raise EvidenceError("Decision and rationale are required")
    return append_entry(root / "decisions.jsonl", entry)


def report(root: Path, as_of: str) -> dict[str, Any]:
    target = _parse_date(as_of)
    measures = [entry for entry in read_chain(root / "measures.jsonl") if entry["effective_date"] <= target]
    decisions = [entry for entry in read_chain(root / "decisions.jsonl") if entry["effective_date"] <= target]

    latest: dict[str, dict[str, Any]] = {}
    for entry in sorted(measures, key=lambda item: (item["effective_date"], item["recorded_at"])):
        latest[entry["name"]] = entry
    return {
        "schema_version": 1,
        "as_of": target,
        "active_measures": list(latest.values()),
        "decisions": decisions,
        "chain_status": "verified",
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("evidence"))
    commands = parser.add_subparsers(dest="command", required=True)

    measure = commands.add_parser("add-measure")
    measure.add_argument("--name", required=True)
    measure.add_argument("--version", required=True)
    measure.add_argument("--date", required=True)
    measure.add_argument("--config", action="append", default=[], type=Path)
    measure.add_argument("--notes", default="")

    decision = commands.add_parser("add-decision")
    decision.add_argument("--decision", required=True)
    decision.add_argument("--rationale", required=True)
    decision.add_argument("--date", required=True)

    report_command = commands.add_parser("report")
    report_command.add_argument("--date", required=True)
    report_command.add_argument("--output", type=Path)

    commands.add_parser("verify")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "add-measure":
            result = add_measure(args.root, args.name, args.version, args.date, args.config, args.notes)
        elif args.command == "add-decision":
            result = add_decision(args.root, args.decision, args.rationale, args.date)
        elif args.command == "report":
            result = report(args.root, args.date)
            if args.output:
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                print(f"Evidence report written to {args.output}")
                return 0
        else:
            measures = read_chain(args.root / "measures.jsonl")
            decisions = read_chain(args.root / "decisions.jsonl")
            result = {"status": "verified", "measures": len(measures), "decisions": len(decisions)}
    except EvidenceError as exc:
        print(f"Evidence error: {exc}")
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
