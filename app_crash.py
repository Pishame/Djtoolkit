"""
Crash reporting and runtime error hooks for the DJ Production Suite.
Writes crash logs to Backups/crash_reports and optionally notifies the user via Qt.
"""
import os
import sys
import threading
import traceback
from datetime import datetime
from pathlib import Path

from PySide6 import QtCore, QtWidgets

_CRASH_DIALOG_ACTIVE = False


def app_base_dir() -> Path:
    """Return the application base directory (executable dir when frozen, else script dir)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def write_crash_report(kind: str, title: str, details: str, tb: str = "") -> Path:
    """Write a crash report to Backups/crash_reports and return the file path."""
    base_dir = app_base_dir()
    crash_dir = base_dir / "Backups" / "crash_reports"
    crash_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_path = crash_dir / f"{stamp}_{kind}.log"
    lines = [
        f"time={datetime.now().isoformat(timespec='seconds')}",
        f"kind={kind}",
        f"title={title}",
        f"python={sys.version.replace(os.linesep, ' ')}",
        f"cwd={Path.cwd()}",
        f"base_dir={base_dir}",
        "",
        "details:",
        details or "(none)",
    ]
    if tb:
        lines += ["", "traceback:", tb]
    file_path.write_text("\n".join(lines), encoding="utf-8")
    return file_path


def notify_crash_user(title: str, body: str) -> None:
    """Show a critical message box to the user if the Qt app is running."""
    global _CRASH_DIALOG_ACTIVE
    if _CRASH_DIALOG_ACTIVE:
        return
    app = QtWidgets.QApplication.instance()
    if app is None:
        return
    _CRASH_DIALOG_ACTIVE = True
    try:
        QtWidgets.QMessageBox.critical(None, title, body)
    finally:
        _CRASH_DIALOG_ACTIVE = False


def install_runtime_error_hooks() -> None:
    """Install sys.excepthook, threading.excepthook, and Qt message handler for crash capture."""
    def handle_uncaught(exc_type: type[BaseException], exc_value: BaseException, exc_tb: object) -> None:
        tb_text = "".join(traceback.format_exception(exc_type, exc_value, exc_tb))
        report = write_crash_report(
            "uncaught",
            "Unhandled exception",
            str(exc_value),
            tb_text,
        )
        notify_crash_user(
            "App Error Captured",
            f"An unexpected error was captured.\n\nSaved report:\n{report}",
        )

    def handle_threading(args: threading.ExceptHookArgs) -> None:
        tb_text = "".join(traceback.format_exception(args.exc_type, args.exc_value, args.exc_traceback))
        report = write_crash_report(
            "thread",
            f"Thread exception: {getattr(args.thread, 'name', 'unknown')}",
            str(args.exc_value),
            tb_text,
        )
        notify_crash_user(
            "Background Task Error Captured",
            f"A background task failed.\n\nSaved report:\n{report}",
        )

    def handle_qt_message(msg_type: QtCore.QtMsgType, context: QtCore.QMessageLogContext, message: str) -> None:
        level_map = {
            QtCore.QtDebugMsg: "debug",
            QtCore.QtInfoMsg: "info",
            QtCore.QtWarningMsg: "warning",
            QtCore.QtCriticalMsg: "critical",
            QtCore.QtFatalMsg: "fatal",
        }
        level = level_map.get(msg_type, "qt")
        if level in {"warning", "critical", "fatal"}:
            details = f"{message}\nfile={context.file}\nline={context.line}\nfunction={context.function}"
            write_crash_report(f"qt_{level}", "Qt runtime message", details)

    sys.excepthook = handle_uncaught
    if hasattr(threading, "excepthook"):
        threading.excepthook = handle_threading  # type: ignore[assignment]
    QtCore.qInstallMessageHandler(handle_qt_message)
