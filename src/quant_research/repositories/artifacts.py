"""Small SQLite-backed stores for reusable research artifacts and runs."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


class SqliteArtifactStore:
    """Persist JSON artifacts so completed work survives reloads and restarts."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS research_artifacts (
                    kind TEXT NOT NULL,
                    artifact_key TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (kind, artifact_key)
                )
                """
            )

    def get(self, kind: str, artifact_key: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload FROM research_artifacts WHERE kind = ? AND artifact_key = ?",
                (kind, artifact_key),
            ).fetchone()
        if row is None:
            return None
        value = json.loads(row[0])
        return value if isinstance(value, dict) else None

    def save(self, kind: str, artifact_key: str, payload: dict[str, Any]) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO research_artifacts (kind, artifact_key, payload, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(kind, artifact_key) DO UPDATE SET
                    payload = excluded.payload,
                    updated_at = excluded.updated_at
                """,
                (kind, artifact_key, json.dumps(payload, default=str), datetime.now(UTC).isoformat()),
            )

    def list(self, kind: str, limit: int = 100) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT payload FROM research_artifacts WHERE kind = ? ORDER BY updated_at DESC LIMIT ?",
                (kind, limit),
            ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)
