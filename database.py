"""
SQLite file database for copyright scan results.
"""
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional


class FileDatabase:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_hash TEXT NOT NULL UNIQUE,
                file_name TEXT NOT NULL,
                result TEXT NOT NULL,
                block_type TEXT,
                date_tested TEXT NOT NULL,
                last_recheck_date TEXT NOT NULL,
                current_path TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        self.conn.commit()

    def get_by_hash(self, file_hash: str) -> Optional[sqlite3.Row]:
        return self.conn.execute(
            """
            SELECT file_hash, file_name, result, block_type, date_tested, last_recheck_date, current_path
            FROM files WHERE file_hash = ? LIMIT 1
            """,
            (file_hash,),
        ).fetchone()

    def upsert_file(
        self,
        *,
        file_hash: str,
        file_name: str,
        result: str,
        current_path: Optional[Path],
        is_recheck: bool,
        block_type: Optional[str] = None,
        commit: bool = True,
    ) -> None:
        now_iso = datetime.now().isoformat(timespec="seconds")
        current_path_str = str(current_path) if current_path else None
        block_type = block_type or None
        existing = self.conn.execute(
            "SELECT id, date_tested FROM files WHERE file_hash = ?",
            (file_hash,),
        ).fetchone()
        if existing:
            date_tested = existing["date_tested"] if is_recheck else now_iso
            self.conn.execute(
                """
                UPDATE files
                SET file_name=?, result=?, block_type=?, date_tested=?, last_recheck_date=?, current_path=?, updated_at=?
                WHERE file_hash=?
                """,
                (
                    file_name,
                    result,
                    block_type,
                    date_tested,
                    now_iso,
                    current_path_str,
                    now_iso,
                    file_hash,
                ),
            )
        else:
            try:
                self.conn.execute(
                    """
                    INSERT INTO files
                    (file_hash,file_name,result,block_type,date_tested,last_recheck_date,current_path,updated_at)
                    VALUES (?,?,?,?,?,?,?,?)
                    """,
                    (
                        file_hash,
                        file_name,
                        result,
                        block_type,
                        now_iso,
                        now_iso,
                        current_path_str,
                        now_iso,
                    ),
                )
            except sqlite3.IntegrityError:
                self.conn.execute(
                    """
                    UPDATE files
                    SET file_name=?, result=?, block_type=?, last_recheck_date=?, current_path=?, updated_at=?
                    WHERE file_hash=?
                    """,
                    (
                        file_name,
                        result,
                        block_type,
                        now_iso,
                        current_path_str,
                        now_iso,
                        file_hash,
                    ),
                )
        if commit:
            self.conn.commit()

    def bulk_upsert(self, rows: List[Dict[str, object]]) -> None:
        for row in rows:
            self.upsert_file(
                file_hash=str(row["file_hash"]),
                file_name=str(row["file_name"]),
                result=str(row["result"]),
                current_path=row.get("current_path"),
                is_recheck=bool(row.get("is_recheck", False)),
                block_type=row.get("block_type"),
                commit=False,
            )
        self.conn.commit()

    def stats(self) -> Dict[str, int]:
        row = self.conn.execute(
            """
            SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN result='Blocked' THEN 1 ELSE 0 END) AS blocked,
              SUM(CASE WHEN result='Claimed' THEN 1 ELSE 0 END) AS claimed,
              SUM(CASE WHEN result='No_Claim' THEN 1 ELSE 0 END) AS no_claim
            FROM files
            """
        ).fetchone()
        return {
            "total": int(row["total"] or 0),
            "blocked": int(row["blocked"] or 0),
            "claimed": int(row["claimed"] or 0),
            "no_claim": int(row["no_claim"] or 0),
        }

    def close(self) -> None:
        self.conn.close()
