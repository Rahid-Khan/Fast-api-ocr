import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from app.config import settings


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(settings.db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = _connect()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            original_path TEXT NOT NULL,
            file_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            page_count INTEGER DEFAULT 1,
            output_dir TEXT,
            result_text TEXT,
            result_markdown TEXT,
            result_json TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT
        )
    """)
    conn.commit()
    conn.close()


def create_job(job_id: str, filename: str, original_path: str, file_type: str, page_count: int = 1) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    conn = _connect()
    conn.execute(
        "INSERT INTO jobs (id, filename, original_path, file_type, page_count, status, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
        (job_id, filename, original_path, file_type, page_count, now, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    conn.close()
    return dict(row)


def update_job(job_id: str, **fields) -> None:
    if not fields:
        return
    set_parts = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [job_id]
    conn = _connect()
    conn.execute(f"UPDATE jobs SET {set_parts} WHERE id = ?", values)
    conn.commit()
    conn.close()


def get_job(job_id: str) -> dict | None:
    conn = _connect()
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_jobs(limit: int = 50, offset: int = 0) -> list[dict]:
    conn = _connect()
    rows = conn.execute(
        "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def count_jobs() -> int:
    conn = _connect()
    total = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    conn.close()
    return total


def delete_job(job_id: str) -> None:
    conn = _connect()
    conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
    conn.commit()
    conn.close()
