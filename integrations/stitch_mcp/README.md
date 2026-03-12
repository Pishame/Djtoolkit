# Stitch MCP Integration

Read-only, manual-sync MCP server for pulling Stitch designs into this repo.

## Install
```powershell
python -m pip install -r integrations/stitch_mcp/requirements.txt
```

## Environment
Set required env vars:
- `STITCH_API_BASE_URL`
- `STITCH_API_KEY`

Optional:
- `STITCH_TIMEOUT_SEC` (default `30`)
- `STITCH_MAX_RETRIES` (default `3`)
- `STITCH_EXPORT_ROOT` (default `design/stitch_exports`)

## Run server
```powershell
python -m integrations.stitch_mcp.server
```

## Exposed tools
- `stitch.list_projects()`
- `stitch.list_pages(project_id)`
- `stitch.pull_page(project_id, page_id, include_assets=true, include_tokens=true)`
- `stitch.pull_project(project_id, include_assets=true, include_tokens=true)`
- `stitch.get_manifest()`

## Exposed resources
- `stitch://manifest/latest`
- `stitch://project/{project_id}`
- `stitch://page/{project_id}/{page_id}`
- `stitch://tokens/{project_id}`

## Export output
All exported artifacts are written under:
- `design/stitch_exports/`

Includes normalized `projects/`, `pages/`, `tokens/`, `assets/`, `snapshots/`, and `manifest.json`.

