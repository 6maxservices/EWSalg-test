"""Metadata-only SQLite query log."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import sqlite3


@dataclass(frozen=True)
class QueryEvent:
    route: str
    provider: str
    origin: str
    prompt_text: str
    estimated_cost_usd: float
    origin_result: str
    dlp_result: str
    outcome: str
    http_status: int


class QueryLog:
    """Append query metadata without retaining prompt contents."""

    def __init__(self, path: Path) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(path)
        try:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS query_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    route TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    origin TEXT NOT NULL,
                    prompt_sha256 TEXT NOT NULL,
                    prompt_chars INTEGER NOT NULL,
                    estimated_tokens INTEGER NOT NULL,
                    estimated_cost_usd REAL NOT NULL,
                    origin_result TEXT NOT NULL,
                    dlp_result TEXT NOT NULL,
                    outcome TEXT NOT NULL,
                    http_status INTEGER NOT NULL
                )
                """
            )
            connection.commit()
        finally:
            connection.close()

    def append(self, event: QueryEvent) -> None:
        prompt_bytes = event.prompt_text.encode("utf-8")
        estimated_tokens = max(1, (len(event.prompt_text) + 3) // 4)
        connection = sqlite3.connect(self.path)
        try:
            connection.execute(
                """
                INSERT INTO query_events (
                    timestamp, route, provider, origin, prompt_sha256,
                    prompt_chars, estimated_tokens, estimated_cost_usd,
                    origin_result, dlp_result, outcome, http_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    datetime.now(timezone.utc).isoformat(),
                    event.route,
                    event.provider,
                    event.origin,
                    hashlib.sha256(prompt_bytes).hexdigest(),
                    len(event.prompt_text),
                    estimated_tokens,
                    event.estimated_cost_usd,
                    event.origin_result,
                    event.dlp_result,
                    event.outcome,
                    event.http_status,
                ),
            )
            connection.commit()
        finally:
            connection.close()
