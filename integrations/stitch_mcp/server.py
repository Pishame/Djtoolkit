from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List
import json
import logging
import mimetypes

from mcp.server.fastmcp import FastMCP

from .config import load_config, validate_config
from .exporter import (
    atomic_write_json,
    ensure_export_tree,
    normalize_page,
    normalize_project,
    normalize_tokens,
    read_json,
    update_manifest,
    write_snapshot,
)
from .stitch_client import StitchClient


def _setup_logger(log_path: Path) -> logging.Logger:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("stitch_mcp")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.FileHandler(log_path, encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        logger.addHandler(handler)
    return logger


cfg = load_config()
logger = _setup_logger(cfg.log_path)
mcp = FastMCP("mcp-stitch")


def _paths() -> Path:
    root = cfg.export_root
    ensure_export_tree(root)
    return root


def _client() -> StitchClient:
    validate_config(cfg)
    return StitchClient(cfg, logger)


def _asset_ext(url: str) -> str:
    suffix = Path(url.split("?")[0]).suffix
    if suffix:
        return suffix
    mime = mimetypes.guess_type(url)[0]
    if mime:
        guessed = mimetypes.guess_extension(mime)
        if guessed:
            return guessed
    return ".bin"


@mcp.tool(name="stitch.list_projects")
def list_projects() -> List[Dict[str, Any]]:
    projects = _client().list_projects()
    return [
        {
            "project_id": str(p.get("id") or p.get("project_id") or ""),
            "name": p.get("name") or "Untitled Project",
            "updated_at": p.get("updated_at") or p.get("modified_at"),
        }
        for p in projects
    ]


@mcp.tool(name="stitch.list_pages")
def list_pages(project_id: str) -> List[Dict[str, Any]]:
    pages = _client().list_pages(project_id)
    return [
        {
            "page_id": str(p.get("id") or p.get("page_id") or ""),
            "name": p.get("name") or "Untitled Page",
            "updated_at": p.get("updated_at") or p.get("modified_at"),
        }
        for p in pages
    ]


@mcp.tool(name="stitch.pull_page")
def pull_page(project_id: str, page_id: str, include_assets: bool = True, include_tokens: bool = True) -> Dict[str, Any]:
    root = _paths()
    client = _client()
    warnings: List[str] = []
    changed: List[Path] = []

    project_raw = client.get_project(project_id)
    page_raw = client.get_page(project_id, page_id)
    project = normalize_project(project_raw)
    page = normalize_page(project_id, page_raw)

    project_file = root / "projects" / f"{project_id}.json"
    page_file = root / "pages" / project_id / f"{page_id}.json"
    atomic_write_json(project_file, project)
    atomic_write_json(page_file, page)
    changed.extend([project_file, page_file])

    if include_tokens:
        try:
            tokens = normalize_tokens(client.get_tokens(project_id))
            token_file = root / "tokens" / f"{project_id}.json"
            atomic_write_json(token_file, tokens)
            changed.append(token_file)
        except Exception as exc:
            warnings.append(f"Tokens pull failed: {exc}")

    if include_assets:
        assets_dir = root / "assets" / project_id
        for asset in page.get("assets") or []:
            if not isinstance(asset, dict):
                continue
            aid = str(asset.get("id") or "")
            url = str(asset.get("url") or "")
            if not aid or not url:
                warnings.append(f"Asset skipped (missing id/url): {asset}")
                continue
            ext = _asset_ext(url)
            out = assets_dir / f"{aid}{ext}"
            try:
                client.download_asset(url, out)
                changed.append(out)
            except Exception as exc:
                warnings.append(f"Asset {aid} download failed: {exc}")

    write_snapshot(root, f"page_{project_id}_{page_id}", {"project": project_raw, "page": page_raw})

    manifest = update_manifest(
        root,
        projects=[
            {
                "project_id": project.get("project_id"),
                "name": project.get("name"),
                "updated_at": project.get("updated_at"),
            }
        ],
        pages=[
            {
                "project_id": project_id,
                "page_id": page_id,
                "name": page.get("meta", {}).get("name"),
                "updated_at": page.get("meta", {}).get("updated_at"),
            }
        ],
        changed_files=changed,
        source_revisions={
            f"project:{project_id}": str(project.get("source", {}).get("revision") or ""),
            f"page:{project_id}:{page_id}": str(page.get("meta", {}).get("source_revision") or ""),
        },
    )
    return {
        "export_path": str(page_file).replace("\\", "/"),
        "updated_files": [str(p).replace("\\", "/") for p in changed],
        "warnings": warnings,
        "manifest": manifest,
    }


@mcp.tool(name="stitch.pull_project")
def pull_project(project_id: str, include_assets: bool = True, include_tokens: bool = True) -> Dict[str, Any]:
    root = _paths()
    client = _client()
    warnings: List[str] = []
    changed: List[Path] = []
    page_summaries: List[Dict[str, Any]] = []

    project_raw = client.get_project(project_id)
    project = normalize_project(project_raw)
    project_file = root / "projects" / f"{project_id}.json"
    atomic_write_json(project_file, project)
    changed.append(project_file)

    pages = client.list_pages(project_id)
    for p in pages:
        page_id = str(p.get("id") or p.get("page_id") or "")
        if not page_id:
            continue
        try:
            page_raw = client.get_page(project_id, page_id)
            page = normalize_page(project_id, page_raw)
            page_file = root / "pages" / project_id / f"{page_id}.json"
            atomic_write_json(page_file, page)
            changed.append(page_file)
            page_summaries.append(
                {
                    "project_id": project_id,
                    "page_id": page_id,
                    "name": page.get("meta", {}).get("name"),
                    "updated_at": page.get("meta", {}).get("updated_at"),
                }
            )

            if include_assets:
                for asset in page.get("assets") or []:
                    if not isinstance(asset, dict):
                        continue
                    aid = str(asset.get("id") or "")
                    url = str(asset.get("url") or "")
                    if not aid or not url:
                        continue
                    out = root / "assets" / project_id / f"{aid}{_asset_ext(url)}"
                    try:
                        client.download_asset(url, out)
                        changed.append(out)
                    except Exception as exc:
                        warnings.append(f"Asset {aid} failed: {exc}")
        except Exception as exc:
            warnings.append(f"Page {page_id} failed: {exc}")

    if include_tokens:
        try:
            tokens = normalize_tokens(client.get_tokens(project_id))
            token_file = root / "tokens" / f"{project_id}.json"
            atomic_write_json(token_file, tokens)
            changed.append(token_file)
        except Exception as exc:
            warnings.append(f"Tokens pull failed: {exc}")

    write_snapshot(root, f"project_{project_id}", {"project": project_raw, "pages": pages})

    manifest = update_manifest(
        root,
        projects=[
            {
                "project_id": project.get("project_id"),
                "name": project.get("name"),
                "updated_at": project.get("updated_at"),
            }
        ],
        pages=page_summaries,
        changed_files=changed,
        source_revisions={f"project:{project_id}": str(project.get("source", {}).get("revision") or "")},
    )
    return {
        "project_export_path": str(project_file).replace("\\", "/"),
        "page_count": len(page_summaries),
        "updated_files": [str(p).replace("\\", "/") for p in changed],
        "warnings": warnings,
        "manifest": manifest,
    }


@mcp.tool(name="stitch.get_manifest")
def get_manifest() -> Dict[str, Any]:
    root = _paths()
    default_manifest = {
        "last_sync_at": None,
        "sync_mode": "manual",
        "projects": [],
        "pages": [],
        "changed_files": [],
        "source_revisions": {},
    }
    return read_json(root / "manifest.json", default_manifest)


@mcp.resource("stitch://manifest/latest")
def resource_manifest() -> str:
    return json.dumps(get_manifest(), indent=2)


@mcp.resource("stitch://project/{project_id}")
def resource_project(project_id: str) -> str:
    root = _paths()
    p = root / "projects" / f"{project_id}.json"
    if not p.exists():
        return json.dumps({"error": "not_found", "project_id": project_id}, indent=2)
    return p.read_text(encoding="utf-8")


@mcp.resource("stitch://page/{project_id}/{page_id}")
def resource_page(project_id: str, page_id: str) -> str:
    root = _paths()
    p = root / "pages" / project_id / f"{page_id}.json"
    if not p.exists():
        return json.dumps({"error": "not_found", "project_id": project_id, "page_id": page_id}, indent=2)
    return p.read_text(encoding="utf-8")


@mcp.resource("stitch://tokens/{project_id}")
def resource_tokens(project_id: str) -> str:
    root = _paths()
    p = root / "tokens" / f"{project_id}.json"
    if not p.exists():
        return json.dumps({"error": "not_found", "project_id": project_id}, indent=2)
    return p.read_text(encoding="utf-8")


def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()

