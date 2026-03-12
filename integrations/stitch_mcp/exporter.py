from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List
import json


def ensure_export_tree(root: Path) -> None:
    for sub in [
        root,
        root / "projects",
        root / "pages",
        root / "components",
        root / "assets",
        root / "tokens",
        root / "snapshots",
    ]:
        sub.mkdir(parents=True, exist_ok=True)
    manifest = root / "manifest.json"
    if not manifest.exists():
        atomic_write_json(
            manifest,
            {
                "last_sync_at": None,
                "sync_mode": "manual",
                "projects": [],
                "pages": [],
                "changed_files": [],
                "source_revisions": {},
            },
        )


def atomic_write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(path)


def read_json(path: Path, default: Dict[str, Any]) -> Dict[str, Any]:
    if not path.exists():
        return dict(default)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return dict(default)


def normalize_project(project: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "project_id": str(project.get("id") or project.get("project_id") or ""),
        "name": project.get("name") or "Untitled Project",
        "updated_at": project.get("updated_at") or project.get("modified_at"),
        "source": {"revision": project.get("revision"), "etag": project.get("etag")},
    }


def normalize_page(project_id: str, page: Dict[str, Any]) -> Dict[str, Any]:
    assets_raw = page.get("assets") or []
    assets = []
    for asset in assets_raw:
        if not isinstance(asset, dict):
            continue
        assets.append(
            {
                "id": str(asset.get("id") or asset.get("asset_id") or ""),
                "name": asset.get("name"),
                "type": asset.get("type"),
                "url": asset.get("url") or asset.get("download_url"),
            }
        )
    return {
        "meta": {
            "project_id": project_id,
            "page_id": str(page.get("id") or page.get("page_id") or ""),
            "name": page.get("name") or "Untitled Page",
            "updated_at": page.get("updated_at") or page.get("modified_at"),
            "source_revision": page.get("revision") or page.get("etag"),
        },
        "layout_tree": page.get("layout") or page.get("nodes") or {},
        "styles": page.get("styles") or {},
        "interactions": page.get("interactions") or [],
        "assets": assets,
    }


def normalize_tokens(tokens: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "colors": tokens.get("colors") or {},
        "spacing": tokens.get("spacing") or {},
        "radii": tokens.get("radii") or tokens.get("radius") or {},
        "typography": tokens.get("typography") or {},
        "shadows": tokens.get("shadows") or {},
        "motion": tokens.get("motion") or {},
    }


def write_snapshot(root: Path, name: str, payload: Dict[str, Any]) -> Path:
    snapshots = root / "snapshots"
    snapshots.mkdir(parents=True, exist_ok=True)
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    path = snapshots / f"{stamp}_{name}.json"
    atomic_write_json(path, payload)
    return path


def update_manifest(
    root: Path,
    *,
    projects: List[Dict[str, Any]],
    pages: List[Dict[str, Any]],
    changed_files: List[Path],
    source_revisions: Dict[str, str],
) -> Dict[str, Any]:
    manifest_path = root / "manifest.json"
    defaults = {
        "last_sync_at": None,
        "sync_mode": "manual",
        "projects": [],
        "pages": [],
        "changed_files": [],
        "source_revisions": {},
    }
    manifest = read_json(manifest_path, defaults)
    manifest["last_sync_at"] = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    manifest["sync_mode"] = "manual"
    manifest["projects"] = projects
    manifest["pages"] = pages
    manifest["changed_files"] = [str(p).replace("\\", "/") for p in changed_files]
    existing = manifest.get("source_revisions")
    if not isinstance(existing, dict):
        existing = {}
    existing.update(source_revisions)
    manifest["source_revisions"] = existing
    atomic_write_json(manifest_path, manifest)
    return manifest

