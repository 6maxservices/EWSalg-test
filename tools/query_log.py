"""Summarize or rotate the gateway's metadata-only SQLite query log."""

from __future__ import annotations

import argparse
from datetime import date
import json
from pathlib import Path
import sqlite3
import tempfile
from typing import Any


COLUMNS = (
    "id",
    "timestamp",
    "route",
    "provider",
    "origin",
    "prompt_sha256",
    "prompt_chars",
    "estimated_tokens",
    "estimated_cost_usd",
    "origin_result",
    "dlp_result",
    "outcome",
    "http_status",
)


def summarize(path: Path) -> dict[str, Any]:
    connection = sqlite3.connect(path)
    try:
        rows = connection.execute(
            """
            SELECT route, provider, origin, outcome, COUNT(*),
                   SUM(CASE WHEN outcome = 'preflight' THEN estimated_tokens ELSE 0 END),
                   SUM(CASE WHEN outcome = 'preflight' THEN estimated_cost_usd ELSE 0 END)
            FROM query_events
            GROUP BY route, provider, origin, outcome
            ORDER BY route, provider, origin, outcome
            """
        ).fetchall()
    finally:
        connection.close()
    return {
        "schema_version": 1,
        "groups": [
            {
                "route": row[0],
                "provider": row[1],
                "origin": row[2],
                "outcome": row[3],
                "events": row[4],
                "estimated_tokens": row[5] or 0,
                "estimated_cost_usd": row[6] or 0,
            }
            for row in rows
        ],
    }


def rotate(path: Path, before: str, archive: Path) -> dict[str, Any]:
    cutoff = date.fromisoformat(before).isoformat() + "T00:00:00"
    if archive.exists():
        raise FileExistsError(f"Archive already exists: {archive}")
    connection = sqlite3.connect(path, timeout=10)
    temporary: Path | None = None
    try:
        connection.execute("BEGIN IMMEDIATE")
        placeholders = ", ".join(COLUMNS)
        rows = connection.execute(
            f"SELECT {placeholders} FROM query_events WHERE timestamp < ? ORDER BY id",  # noqa: S608
            (cutoff,),
        ).fetchall()
        archive.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=archive.parent, delete=False) as handle:
            for row in rows:
                handle.write(json.dumps(dict(zip(COLUMNS, row, strict=True)), sort_keys=True) + "\n")
            temporary = Path(handle.name)
        connection.execute("DELETE FROM query_events WHERE timestamp < ?", (cutoff,))
        temporary.replace(archive)
        temporary = None
        connection.commit()
        connection.execute("PRAGMA secure_delete = ON")
        connection.execute("VACUUM")
    except Exception:
        connection.rollback()
        if temporary and temporary.exists():
            temporary.unlink()
        raise
    finally:
        connection.close()
    return {"status": "PASS", "rotated_events": len(rows), "archive": archive.as_posix(), "before": before}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=Path("var/query-log.sqlite3"))
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("summary")
    rotate_parser = commands.add_parser("rotate")
    rotate_parser.add_argument("--before", required=True)
    rotate_parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "summary":
            result = summarize(args.database)
        else:
            archive = args.archive or Path("var/query-archive") / f"events-before-{args.before}.jsonl"
            result = rotate(args.database, args.before, archive)
    except (OSError, sqlite3.Error, ValueError) as exc:
        print(json.dumps({"status": "FAIL", "error": type(exc).__name__}))
        return 2
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
