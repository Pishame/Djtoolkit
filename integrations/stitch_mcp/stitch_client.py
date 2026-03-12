from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional
import logging
import time

import requests

from .config import StitchConfig


class StitchClient:
    def __init__(self, cfg: StitchConfig, logger: logging.Logger):
        self.cfg = cfg
        self.logger = logger

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.cfg.api_key}",
            "Accept": "application/json",
        }

    def _request(self, method: str, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{self.cfg.api_base_url}{path}"
        delays = [0.5, 1.0, 2.0]
        last_error: Optional[Exception] = None
        for attempt in range(self.cfg.max_retries + 1):
            started = time.monotonic()
            try:
                resp = requests.request(
                    method=method,
                    url=url,
                    params=params,
                    headers=self._headers(),
                    timeout=self.cfg.timeout_sec,
                )
                duration_ms = int((time.monotonic() - started) * 1000)
                self.logger.info(
                    "request method=%s path=%s status=%s duration_ms=%s",
                    method,
                    path,
                    resp.status_code,
                    duration_ms,
                )

                if resp.status_code in (401, 403):
                    raise PermissionError("Authentication failed (401/403). Check STITCH_API_KEY.")
                if resp.status_code == 429:
                    if attempt < self.cfg.max_retries:
                        retry_after = resp.headers.get("Retry-After")
                        wait = float(retry_after) if retry_after else delays[min(attempt, len(delays) - 1)]
                        time.sleep(wait)
                        continue
                    raise RuntimeError("Rate-limited by Stitch API (429).")
                if 500 <= resp.status_code < 600:
                    if attempt < self.cfg.max_retries:
                        time.sleep(delays[min(attempt, len(delays) - 1)])
                        continue
                    raise RuntimeError(f"Stitch server error: HTTP {resp.status_code}")
                if resp.status_code >= 400:
                    raise RuntimeError(f"Stitch request failed: HTTP {resp.status_code} - {resp.text[:260]}")

                if not resp.text.strip():
                    return {}
                data = resp.json()
                return data if isinstance(data, dict) else {"items": data}
            except Exception as exc:
                last_error = exc
                if attempt < self.cfg.max_retries:
                    time.sleep(delays[min(attempt, len(delays) - 1)])
                    continue
                break
        raise RuntimeError(f"Request failed for {path}: {last_error}") from last_error

    def list_projects(self) -> List[Dict[str, Any]]:
        payload = self._request("GET", "/projects")
        items = payload.get("projects")
        if isinstance(items, list):
            return [x for x in items if isinstance(x, dict)]
        if isinstance(payload.get("items"), list):
            return [x for x in payload["items"] if isinstance(x, dict)]
        return []

    def list_pages(self, project_id: str) -> List[Dict[str, Any]]:
        payload = self._request("GET", f"/projects/{project_id}/pages")
        items = payload.get("pages")
        if isinstance(items, list):
            return [x for x in items if isinstance(x, dict)]
        if isinstance(payload.get("items"), list):
            return [x for x in payload["items"] if isinstance(x, dict)]
        return []

    def get_project(self, project_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/projects/{project_id}")

    def get_page(self, project_id: str, page_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/projects/{project_id}/pages/{page_id}")

    def get_tokens(self, project_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/projects/{project_id}/tokens")

    def download_asset(self, url: str, out_path: Path) -> None:
        resp = requests.get(url, timeout=self.cfg.timeout_sec)
        if resp.status_code >= 400:
            raise RuntimeError(f"Asset download failed: HTTP {resp.status_code}")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = out_path.with_suffix(out_path.suffix + ".tmp")
        tmp.write_bytes(resp.content)
        tmp.replace(out_path)

