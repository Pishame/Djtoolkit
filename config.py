"""
Application constants and small bridge/UI helpers used across the suite.
"""
from datetime import datetime

ALLOWED_EXTENSIONS = {".mp3", ".mp4", ".aac"}
RESULT_BLOCKED = "Blocked"
RESULT_CLAIMED = "Claimed"
RESULT_NO_CLAIM = "No_Claim"
RESULTS = {RESULT_BLOCKED, RESULT_CLAIMED, RESULT_NO_CLAIM}
BLOCK_TYPES = ["Worldwide", "Partial (Some Countries)", "Audio Muted Only"]
BRIDGE_CONTRACT_VERSION = "1.0"


def bridge_iso_now() -> str:
    """Return current UTC time in ISO format (seconds) for bridge responses."""
    return datetime.now().isoformat(timespec="seconds")


def map_job_state_for_ui(state_text: str, running: bool, progress: int) -> str:
    """Map toolkit job state string and flags to a simple UI state."""
    s = (state_text or "").strip().lower()
    if "error" in s or "fail" in s:
        return "failed"
    if "complete" in s and not running:
        return "completed"
    if running and progress > 0:
        return "running"
    if running:
        return "preparing"
    return "idle"
