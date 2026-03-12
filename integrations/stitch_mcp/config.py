from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class StitchConfig:
    api_base_url: str
    api_key: str
    timeout_sec: float = 30.0
    max_retries: int = 3
    export_root: Path = Path("design/stitch_exports")
    log_path: Path = Path("Backups/stitch_mcp.log")


def load_config() -> StitchConfig:
    base = os.getenv("STITCH_API_BASE_URL", "").strip().rstrip("/")
    key = os.getenv("STITCH_API_KEY", "").strip()
    timeout = float(os.getenv("STITCH_TIMEOUT_SEC", "30"))
    retries = int(os.getenv("STITCH_MAX_RETRIES", "3"))
    export_root = Path(os.getenv("STITCH_EXPORT_ROOT", "design/stitch_exports"))
    cfg = StitchConfig(
        api_base_url=base,
        api_key=key,
        timeout_sec=max(1.0, timeout),
        max_retries=max(0, retries),
        export_root=export_root,
    )
    return cfg


def validate_config(cfg: StitchConfig) -> None:
    missing = []
    if not cfg.api_base_url:
        missing.append("STITCH_API_BASE_URL")
    if not cfg.api_key:
        missing.append("STITCH_API_KEY")
    if missing:
        raise ValueError(f"Missing required environment variable(s): {', '.join(missing)}")
