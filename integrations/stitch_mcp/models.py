from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class ProjectSummary:
    project_id: str
    name: str
    updated_at: Optional[str] = None


@dataclass
class PageSummary:
    page_id: str
    name: str
    updated_at: Optional[str] = None


@dataclass
class PullResult:
    export_path: str
    updated_files: List[str]
    warnings: List[str]


def as_list_of_dict(items: List[Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for item in items:
        if hasattr(item, "__dict__"):
            out.append(dict(item.__dict__))
        elif isinstance(item, dict):
            out.append(item)
    return out
