"""
Data models used by the database and scan worker.
"""
from dataclasses import dataclass
from pathlib import Path


@dataclass
class FileItem:
    path: Path
    file_hash: str
