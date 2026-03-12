"""
Background worker for hashing files and checking them against the copyright database.
"""
import hashlib
import shutil
import sqlite3
from pathlib import Path
from typing import Dict, List

from PySide6 import QtCore

from models import FileItem


class ScanWorker(QtCore.QThread):
    progress = QtCore.Signal(int, int, str)
    done = QtCore.Signal(int, int, list, list)  # total, skipped, new_items, duplicates
    failed = QtCore.Signal(str)

    def __init__(self, files: List[Path], db_path: Path, tested_dir: Path, auto_move_duplicates: bool):
        super().__init__()
        self.files = files
        self.db_path = db_path
        self.tested_dir = tested_dir
        self.auto_move_duplicates = auto_move_duplicates

    @staticmethod
    def compute_sha256(file_path: Path) -> str:
        hasher = hashlib.sha256()
        with file_path.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

    def _safe_move(self, source: Path, destination_dir: Path) -> Path:
        destination_dir.mkdir(parents=True, exist_ok=True)
        candidate = destination_dir / source.name
        if not candidate.exists():
            shutil.move(str(source), str(candidate))
            return candidate
        stem, suffix, i = source.stem, source.suffix, 1
        while True:
            candidate = destination_dir / f"{stem}_{i}{suffix}"
            if not candidate.exists():
                shutil.move(str(source), str(candidate))
                return candidate
            i += 1

    def run(self) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        total = len(self.files)
        skipped = 0
        new_items: List[FileItem] = []
        duplicates: List[Dict[str, object]] = []
        try:
            for i, file_path in enumerate(self.files, start=1):
                self.progress.emit(i, total, file_path.name)
                file_hash = self.compute_sha256(file_path)
                existing = conn.execute(
                    """
                    SELECT file_hash,file_name,result,block_type,date_tested,last_recheck_date,current_path
                    FROM files WHERE file_hash = ? LIMIT 1
                    """,
                    (file_hash,),
                ).fetchone()
                if existing:
                    skipped += 1
                    duplicates.append(dict(existing))
                    if self.auto_move_duplicates and file_path.exists():
                        self._safe_move(file_path, self.tested_dir)
                else:
                    new_items.append(FileItem(path=file_path, file_hash=file_hash))
            self.done.emit(total, skipped, new_items, duplicates)
        except Exception as exc:
            self.failed.emit(str(exc))
        finally:
            conn.close()
