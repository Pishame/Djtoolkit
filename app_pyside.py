import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback
from copy import deepcopy
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable, Dict, List, Optional
from urllib.parse import parse_qs, urlparse
try:
    import winsound
except Exception:
    winsound = None  # type: ignore[assignment]

from PySide6 import QtCore, QtGui, QtWidgets
try:
    from PySide6.QtWebEngineWidgets import QWebEngineView
except Exception:
    QWebEngineView = None  # type: ignore[assignment]
try:
    from PySide6.QtWebChannel import QWebChannel
except Exception:
    QWebChannel = None  # type: ignore[assignment]

from app_crash import app_base_dir, install_runtime_error_hooks
from config import (
    ALLOWED_EXTENSIONS,
    BLOCK_TYPES,
    BRIDGE_CONTRACT_VERSION,
    RESULT_BLOCKED,
    RESULT_CLAIMED,
    RESULT_NO_CLAIM,
    bridge_iso_now,
    map_job_state_for_ui,
)
from database import FileDatabase
from models import FileItem
from scan_worker import ScanWorker
from toolkit_process import NativeToolkitProcessHandle
from ui_widgets import (
    AnimatedButton,
    CommandPaletteDialog,
    FallbackDownloadDialog,
    SmoothScrollArea,
    UrlInputDialog,
)

class ToolkitWebBridge(QtCore.QObject):
    def __init__(self, window: "MainWindow") -> None:
        super().__init__(window)
        self._window = window

    @QtCore.Slot(str, result=str)
    def bridgeCommand(self, command_json: str) -> str:
        raw = (command_json or "").strip()
        try:
            command = json.loads(raw) if raw else {}
        except Exception:
            command = {}
        response = self._window.handle_bridge_command(command if isinstance(command, dict) else {})
        try:
            return json.dumps(response, ensure_ascii=False)
        except Exception:
            fallback = {
                "version": BRIDGE_CONTRACT_VERSION,
                "ok": False,
                "error": {"code": "E_BRIDGE_SERIALIZE", "message": "Failed to serialize bridge response."},
            }
            return json.dumps(fallback, ensure_ascii=False)

    # Compatibility shims for older frontend builds.
    @QtCore.Slot(str, str)
    def runToolkitOption(self, option: str, payload_json: str) -> None:
        payload: Dict[str, object] = {}
        raw = (payload_json or "").strip()
        if raw:
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    payload = parsed
            except Exception:
                pass
        self._window.run_toolkit_option_direct(str(option).strip(), payload)

    @QtCore.Slot()
    def stopToolkit(self) -> None:
        self._window.stop_toolkit_process()

    @QtCore.Slot(str, str, result=str)
    def pickFolder(self, key: str, current_path: str) -> str:
        return self._window.pick_output_folder(str(key).strip().lower(), str(current_path or "").strip())

    @QtCore.Slot(str, result=str)
    def pickFiles(self, mode: str) -> str:
        files = self._window.pick_files_for_mode(str(mode or "").strip().lower())
        return json.dumps(files, ensure_ascii=False)

    @QtCore.Slot(str, result=str)
    def getLastPickedFiles(self, mode: str) -> str:
        mode_l = str(mode or "").strip().lower()
        cached_mode = str(self._window._last_picker_mode or "").strip().lower()
        files: List[str] = []
        if self._window._last_picker_files:
            files = [str(x) for x in self._window._last_picker_files if str(x).strip()]
        if mode_l and cached_mode and mode_l != cached_mode:
            files = []
        payload = {
            "mode": cached_mode or "",
            "files": files,
            "age_ms": int(max(0.0, (time.time() - float(self._window._last_picker_ts or 0.0)) * 1000.0)),
        }
        return json.dumps(payload, ensure_ascii=False)

    @QtCore.Slot()
    def scanCopyright(self) -> None:
        self._window.scan_folder()


class MainWindow(QtWidgets.QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("DJ Production Suite (PySide6)")
        self.resize(1380, 860)

        self.base_dir = app_base_dir()
        self.folders = self._ensure_folders(self.base_dir)
        self.db = FileDatabase(self.base_dir / "database.sqlite")
        self.config_path = self.base_dir / "app_config.json"
        self.config = self._load_app_config()
        self._last_picker_mode = ""
        self._last_picker_files: List[str] = []
        self._last_picker_ts = 0.0

        self.current_filter = "All"
        self.new_file_items: List[FileItem] = []
        self.duplicate_records: List[Dict[str, object]] = []
        self._scan_total = 0
        self._scan_skipped = 0
        self._scan_hashing_name = "-"
        self.selected_item: Optional[FileItem] = None
        self.scan_worker: Optional[ScanWorker] = None
        self.page_size = 50
        self.page = 0

        self.toolkit_proc: Optional[subprocess.Popen[str]] = None
        self.toolkit_queue: "queue.Queue[str]" = queue.Queue()
        self._ansi_re = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
        self.toolkit_log_path = self.base_dir / "Backups" / "toolkit_debug.log"
        self.toolkit_log_path.parent.mkdir(parents=True, exist_ok=True)
        self._toolkit_error_seen = False
        self._toolkit_last_message = ""
        self._toolkit_source_title = ""
        self._toolkit_started_at: Optional[datetime] = None
        self._toolkit_last_saved_path: Optional[Path] = None
        self._recent_jobs: List[Dict[str, object]] = []
        self._toolkit_progress_peak = 0
        self._current_theme = str(self.config.get("theme", "Dark")).strip().lower()
        self._current_density = str(self.config.get("density", "Comfortable")).strip().lower()
        self._last_run_option: Optional[str] = None
        self._last_run_payload: Optional[Dict[str, object]] = None
        self._tool_button_specs: List[Dict[str, object]] = []
        self._tool_section_filter = "ALL"
        self._forced_tiktok_mode: Optional[str] = None
        self._tiktok_menu_expanded = False
        self._job_file_total = 0
        self._job_file_index = 0
        self._queue_success_count = 0
        self._queue_fail_count = 0
        self._queue_skip_count = 0
        self._last_bpm_report_path: Optional[Path] = None
        self._last_progress_anim_ts = 0.0
        self._toolkit_started_mono = 0.0
        self._toolkit_last_output_mono = 0.0
        self._toolkit_first_progress_mono = 0.0
        self._toolkit_eta_from_stream = False
        self._toolkit_eta_last_update_mono = 0.0
        self._toolkit_silence_timeout_sec = 90.0
        self._native_cancel_event = threading.Event()
        self._active_toolkit_mode = "script"
        self._toolkit_webview: Optional[QtWidgets.QWidget] = None
        self._web_channel: Optional[QWebChannel] = None
        self._web_bridge: Optional[ToolkitWebBridge] = None
        self._vite_proc: Optional[subprocess.Popen[str]] = None
        self._pending_web_status: Optional[Dict[str, object]] = None
        self._web_status_timer = QtCore.QTimer(self)
        self._web_status_timer.setSingleShot(True)
        self._web_status_timer.setInterval(100)
        self._web_status_timer.timeout.connect(self._flush_web_status)

        self._build_ui()
        self._setup_shortcuts()
        self.refresh_stats()
        self.refresh_new_list()

    @staticmethod
    def _ensure_folders(base_dir: Path) -> Dict[str, Path]:
        folders = {
            "to_test": base_dir / "To_Test",
            "tested": base_dir / "Tested",
            "blocked": base_dir / "Blocked",
            "claimed": base_dir / "Claimed",
            "no_claim": base_dir / "No_Claim",
        }
        for p in folders.values():
            p.mkdir(parents=True, exist_ok=True)
        return folders

    def _setup_shortcuts(self) -> None:
        self._shortcut_tab_next = QtGui.QShortcut(QtGui.QKeySequence("Tab"), self)
        self._shortcut_tab_next.setContext(QtCore.Qt.ApplicationShortcut)
        self._shortcut_tab_next.activated.connect(lambda: self._switch_main_tabs(reverse=False))
        self._shortcut_tab_prev = QtGui.QShortcut(QtGui.QKeySequence("Shift+Tab"), self)
        self._shortcut_tab_prev.setContext(QtCore.Qt.ApplicationShortcut)
        self._shortcut_tab_prev.activated.connect(lambda: self._switch_main_tabs(reverse=True))

    def _switch_main_tabs(self, reverse: bool = False) -> None:
        # Disabled: native page switching via Tab/Shift+Tab caused accidental jumps
        # away from the active web UI surface.
        return

    def _load_app_config(self) -> Dict[str, object]:
        defaults: Dict[str, object] = {
            "auto_move_duplicates": True,
            "track_block_severity": True,
            "keyboard_shortcuts": True,
            "theme": "Dark",
            "density": "Comfortable",
            "mp3_output_path": "",
            "mp4_output_path": "",
            "default_video_quality": "1080p",
            "tiktok_watermark": False,
            "login_email": "",
            "download_history": {},
            "ui_variant": "new",
        }
        if not self.config_path.exists():
            print("Loaded settings loginEmail:", "")
            return dict(defaults)
        try:
            loaded = json.loads(self.config_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                # Backward-compat key normalization for older frontend/export variants.
                normalized = dict(loaded)
                if "login_email" not in normalized and "loginEmail" in normalized:
                    normalized["login_email"] = str(normalized.get("loginEmail", "")).strip()
                if "mp3_output_path" not in normalized and "mp3OutputPath" in normalized:
                    normalized["mp3_output_path"] = str(normalized.get("mp3OutputPath", "")).strip()
                if "mp4_output_path" not in normalized and "mp4OutputPath" in normalized:
                    normalized["mp4_output_path"] = str(normalized.get("mp4OutputPath", "")).strip()
                if "default_video_quality" not in normalized and "defaultVideoQuality" in normalized:
                    normalized["default_video_quality"] = str(normalized.get("defaultVideoQuality", "")).strip()
                if "tiktok_watermark" not in normalized and "tiktokWatermark" in normalized:
                    normalized["tiktok_watermark"] = bool(normalized.get("tiktokWatermark", False))
                merged = dict(defaults)
                merged.update(normalized)
                print("Loaded settings loginEmail:", str(merged.get("login_email", "") or ""))
                return merged
        except Exception:
            pass
        print("Loaded settings loginEmail:", "")
        return dict(defaults)

    def _download_history(self) -> Dict[str, str]:
        raw = self.config.get("download_history", {})
        if not isinstance(raw, dict):
            return {}
        clean: Dict[str, str] = {}
        for k, v in raw.items():
            key = str(k or "").strip()
            val = str(v or "").strip()
            if key and val:
                clean[key] = val
        self.config["download_history"] = clean
        return clean

    def _save_app_config(self) -> None:
        self.config["theme"] = self.cmb_theme.currentText()
        self.config["density"] = self.cmb_density.currentText()
        self.config["keyboard_shortcuts"] = bool(self.chk_shortcuts.isChecked())
        self.config["auto_move_duplicates"] = bool(self.chk_auto_dup.isChecked())
        self.config["track_block_severity"] = bool(self.chk_block_severity.isChecked())
        self._persist_app_config()

    def _persist_app_config(self) -> None:
        self.config_path.write_text(json.dumps(self.config, indent=2), encoding="utf-8")
        print("Saved settings loginEmail:", str(self.config.get("login_email", "") or ""))

    def open_settings_dialog(self) -> None:
        try:
            self._save_app_config()
            self.lbl_status.setText("Settings saved.")
        except Exception as exc:
            self.lbl_status.setText(f"Settings save failed: {exc}")

    def _start_aistudio_dev_server(self) -> bool:
        if self._vite_proc and self._vite_proc.poll() is None:
            return True
        npm = shutil.which("npm") or shutil.which("npm.cmd")
        if npm is None:
            return False
        ai_dir = self.base_dir / "AIstudio"
        if not ai_dir.exists():
            return False
        try:
            log_path = self.base_dir / "Backups" / "aistudio_vite.log"
            log_path.parent.mkdir(parents=True, exist_ok=True)
            self._vite_proc = subprocess.Popen(
                [npm, "run", "dev", "--", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
                cwd=str(ai_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            if self._vite_proc.stdout is not None:
                def _pump() -> None:
                    try:
                        with log_path.open("a", encoding="utf-8") as f:
                            for line in self._vite_proc.stdout:
                                f.write(line)
                    except Exception:
                        pass
                threading.Thread(target=_pump, daemon=True).start()
            return True
        except Exception:
            self._vite_proc = None
            return False

    def _build_toolkit_home_widget(self) -> QtWidgets.QWidget:
        if QWebEngineView is None:
            msg = QtWidgets.QLabel(
                "PySide6 WebEngine is not installed.\nInstall: python -m pip install PySide6\n"
                "Then restart to load AIstudio homepage."
            )
            msg.setAlignment(QtCore.Qt.AlignCenter)
            msg.setWordWrap(True)
            msg.setObjectName("MinorText")
            wrap = QtWidgets.QFrame()
            lay = QtWidgets.QVBoxLayout(wrap)
            lay.addWidget(msg, 1)
            return wrap

        view = QWebEngineView()
        self._toolkit_webview = view
        try:
            view.setStyleSheet("background:#0b0e14;")
            view.page().setBackgroundColor(QtGui.QColor("#0b0e14"))
        except Exception:
            pass
        try:
            profile = view.page().profile()
            # Force latest local dist assets each launch.
            profile.setHttpCacheType(profile.HttpCacheType.NoCache)
            profile.clearHttpCache()
        except Exception:
            pass
        if QWebChannel is not None:
            self._web_channel = QWebChannel(view.page())
            self._web_bridge = ToolkitWebBridge(self)
            self._web_channel.registerObject("pyBridge", self._web_bridge)
            view.page().setWebChannel(self._web_channel)
            view.loadFinished.connect(self._inject_web_bridge)
        # Always prefer the real app build from AIstudio_new_ui.
        # Keep Aistudio/AIstudio as fallback only if the new build is missing.
        ai_candidates = [self.base_dir / "AIstudio_new_ui", self.base_dir / "Aistudio", self.base_dir / "AIstudio"]
        for ai_dir in ai_candidates:
            dist_index = ai_dir / "dist" / "index.html"
            if dist_index.exists():
                url = QtCore.QUrl.fromLocalFile(str(dist_index))
                try:
                    url.setQuery(f"v={int(dist_index.stat().st_mtime)}")
                except Exception:
                    pass
                try:
                    view.setHtml(
                        """
                        <!doctype html>
                        <html lang="en">
                        <head>
                          <meta charset="utf-8">
                          <meta name="viewport" content="width=device-width, initial-scale=1.0">
                          <style>
                            html, body {
                              margin: 0;
                              min-height: 100%;
                              background:
                                radial-gradient(circle at top, rgba(255,0,128,0.16), transparent 30%),
                                linear-gradient(145deg, #0b0e14 0%, #141822 50%, #090b11 100%);
                              color: #f8fafc;
                              font-family: "Segoe UI", Arial, sans-serif;
                            }
                            body {
                              display: flex;
                              align-items: center;
                              justify-content: center;
                            }
                            .boot-card {
                              width: min(360px, calc(100vw - 32px));
                              border: 1px solid rgba(255,255,255,0.08);
                              border-radius: 28px;
                              padding: 32px 28px;
                              background: rgba(9, 11, 17, 0.78);
                              box-shadow: 0 24px 80px rgba(0,0,0,0.42);
                              text-align: center;
                            }
                            .mark {
                              width: 72px;
                              height: 72px;
                              margin: 0 auto 20px;
                              border-radius: 22px;
                              display: grid;
                              place-items: center;
                              background: linear-gradient(135deg, #ff0080 0%, #7c3aed 100%);
                              box-shadow: 0 18px 44px rgba(255,0,128,0.32);
                              font-size: 34px;
                              font-weight: 900;
                            }
                            .title {
                              margin: 0;
                              font-size: 12px;
                              font-weight: 900;
                              letter-spacing: 0.42em;
                              text-transform: uppercase;
                            }
                            .copy {
                              margin: 14px 0 0;
                              color: rgba(226,232,240,0.72);
                              font-size: 11px;
                              font-weight: 700;
                              letter-spacing: 0.18em;
                              text-transform: uppercase;
                            }
                            .track {
                              margin-top: 20px;
                              height: 6px;
                              border-radius: 999px;
                              background: rgba(255,255,255,0.08);
                              overflow: hidden;
                            }
                            .track::after {
                              content: "";
                              display: block;
                              width: 42%;
                              height: 100%;
                              border-radius: inherit;
                              background: linear-gradient(90deg, #ff0080 0%, #7c3aed 100%);
                              animation: slide 1.8s ease-in-out infinite;
                            }
                            @keyframes slide {
                              0% { transform: translateX(-120%); }
                              100% { transform: translateX(320%); }
                            }
                          </style>
                        </head>
                        <body>
                          <div class="boot-card">
                            <div class="mark">DJ</div>
                            <p class="title">DJ Toolkit Pro</p>
                            <div class="track"></div>
                            <p class="copy">Loading studio interface...</p>
                          </div>
                        </body>
                        </html>
                        """
                    )
                except Exception:
                    pass
                view.setUrl(url)
                self.lbl_status.setText(f"Loaded web UI from: {dist_index}")
                try:
                    ui_log = self.base_dir / "Backups" / "ui_load.log"
                    ui_log.parent.mkdir(parents=True, exist_ok=True)
                    with ui_log.open("a", encoding="utf-8") as fh:
                        fh.write(
                            f"{datetime.now().isoformat()} loaded_ui path={dist_index} "
                            f"mtime={int(dist_index.stat().st_mtime)} query={url.query()}\n"
                        )
                except Exception:
                    pass
                return view

        msg = QtWidgets.QLabel(
            "AIstudio desktop build not found.\nRun in UI folder (Aistudio or AIstudio_new_ui):\n"
            "npm install\nnpm run build"
        )
        msg.setAlignment(QtCore.Qt.AlignCenter)
        msg.setWordWrap(True)
        msg.setObjectName("MinorText")
        wrap = QtWidgets.QFrame()
        lay = QtWidgets.QVBoxLayout(wrap)
        lay.addWidget(msg, 1)
        return wrap

    def _inject_web_bridge(self) -> None:
        if QWebEngineView is None or not isinstance(self._toolkit_webview, QWebEngineView):
            return
        login_email = str(self.config.get("login_email", "") or "").strip()
        login_email_js = json.dumps(login_email, ensure_ascii=False)
        login_active_js = "true" if bool(login_email) else "false"
        js = (
            "(function(){"
            f"try{{const _login={login_email_js};"
            f"if(_login){{localStorage.setItem('dj_login_email',_login);localStorage.setItem('dj_login_active','1');}}"
            "else{localStorage.removeItem('dj_login_email');localStorage.removeItem('dj_login_active');}"
            "}catch(_e){}"
            "const boot=()=>{"
            "if(window.__qtBridgeReady){return;}"
            "if(typeof QWebChannel==='undefined' || typeof qt==='undefined' || !qt.webChannelTransport){return;}"
            "new QWebChannel(qt.webChannelTransport,function(channel){"
            "window.pyBridge=channel.objects.pyBridge;"
            f"window.__backendLoginEmail={login_email_js};"
            f"window.__backendLoginActive={login_active_js};"
            "window.__qtBridgeReady=true;"
            "window.dispatchEvent(new CustomEvent('py-bridge-ready'));"
            "});"
            "};"
            "if(typeof QWebChannel==='undefined'){"
            "const s=document.createElement('script');"
            "s.src='qrc:///qtwebchannel/qwebchannel.js';"
            "s.onload=boot;"
            "document.head.appendChild(s);"
            "}else{boot();}"
            "})();"
        )
        self._toolkit_webview.page().runJavaScript(js)

    def _build_ui(self) -> None:
        self.setObjectName("AppRoot")
        self.setStyleSheet(self._theme_stylesheet(self._current_theme))

        central = QtWidgets.QWidget()
        self.setCentralWidget(central)
        root = QtWidgets.QVBoxLayout(central)
        self.root_layout = root
        root.setContentsMargins(14, 12, 14, 12)
        root.setSpacing(14)

        self.header_widget = QtWidgets.QFrame()
        self.header_widget.setObjectName("HeaderBar")
        header = QtWidgets.QHBoxLayout(self.header_widget)
        header.setSpacing(10)
        title = QtWidgets.QLabel("DJ Production Suite")
        title.setObjectName("TitleText")
        header.addWidget(title)
        header.addStretch(1)
        self.btn_nav_toolkit = AnimatedButton("MyDJToolkit", self.style().standardIcon(QtWidgets.QStyle.SP_ComputerIcon))
        self.btn_nav_copyright = AnimatedButton("Copyright", self.style().standardIcon(QtWidgets.QStyle.SP_DirOpenIcon))
        self.btn_nav_key = AnimatedButton("Key Detect", self.style().standardIcon(QtWidgets.QStyle.SP_DialogApplyButton))
        self.btn_nav_settings = AnimatedButton("Settings", self.style().standardIcon(QtWidgets.QStyle.SP_FileDialogDetailedView))
        for b in (self.btn_nav_toolkit, self.btn_nav_copyright, self.btn_nav_key, self.btn_nav_settings):
            b.setCheckable(True)
            b.setProperty("role", "topnav")
        self.btn_nav_toolkit.clicked.connect(self.show_toolkit_page)
        self.btn_nav_copyright.clicked.connect(self.show_copyright_page)
        self.btn_nav_key.clicked.connect(self.show_key_page)
        self.btn_nav_settings.clicked.connect(self.show_settings_page)
        header.addWidget(self.btn_nav_toolkit)
        header.addWidget(self.btn_nav_copyright)
        self.cmb_theme = QtWidgets.QComboBox()
        self.cmb_theme.addItems(["Dark", "Light"])
        self.cmb_theme.setCurrentText(str(self.config.get("theme", "Dark")))
        self.cmb_theme.currentTextChanged.connect(self.on_theme_changed)
        self.cmb_density = QtWidgets.QComboBox()
        self.cmb_density.addItems(["Comfortable", "Compact"])
        self.cmb_density.setCurrentText(str(self.config.get("density", "Comfortable")))
        self.cmb_density.currentTextChanged.connect(self.on_density_changed)
        self.btn_palette = AnimatedButton("⌘K")
        self.btn_palette.setMinimumHeight(34)
        self.btn_palette.clicked.connect(self.open_command_palette)
        header.addWidget(self.cmb_theme)
        header.addWidget(self.cmb_density)
        header.addWidget(self.btn_palette)
        root.addWidget(self.header_widget)

        body = QtWidgets.QHBoxLayout()
        body.setSpacing(12)
        self.left_nav_card = QtWidgets.QFrame()
        self.left_nav_card.setObjectName("Card")
        self.left_nav_card.setMinimumWidth(78)
        self.left_nav_card.setMaximumWidth(92)
        left_nav_l = QtWidgets.QVBoxLayout(self.left_nav_card)
        left_nav_l.setContentsMargins(6, 8, 6, 8)
        left_nav_l.setSpacing(8)
        self.btn_nav_key.setText("")
        self.btn_nav_settings.setText("")
        self.btn_nav_key.setToolTip("Key Detect")
        self.btn_nav_settings.setToolTip("Settings")
        self.btn_nav_key.setObjectName("SideIcon")
        self.btn_nav_settings.setObjectName("SideIcon")
        self.btn_nav_key.setIconSize(QtCore.QSize(18, 18))
        self.btn_nav_settings.setIconSize(QtCore.QSize(18, 18))
        self.btn_nav_key.setMinimumHeight(38)
        self.btn_nav_settings.setMinimumHeight(38)
        self.btn_nav_key.setMaximumHeight(42)
        self.btn_nav_settings.setMaximumHeight(42)
        self.btn_nav_key.setMinimumWidth(38)
        self.btn_nav_settings.setMinimumWidth(38)
        left_nav_l.addWidget(self.btn_nav_key)
        left_nav_l.addWidget(self.btn_nav_settings)
        left_nav_l.addStretch(1)

        main = QtWidgets.QVBoxLayout()
        main.setSpacing(12)
        self.lbl_status = QtWidgets.QLabel("Ready.")
        self.lbl_status.setObjectName("MinorText")
        self.status_rail = QtWidgets.QFrame()
        self.status_rail.setObjectName("StatusRail")
        rail_l = QtWidgets.QHBoxLayout(self.status_rail)
        rail_l.setContentsMargins(12, 8, 12, 8)
        rail_l.setSpacing(14)
        self.rail_task = QtWidgets.QLabel("Task:")
        self.rail_state = QtWidgets.QLabel("State:")
        self.rail_speed = QtWidgets.QLabel("Speed: --")
        self.rail_eta = QtWidgets.QLabel("ETA: --")
        for w in [self.rail_task, self.rail_state, self.rail_speed, self.rail_eta]:
            w.setObjectName("MinorText")
            rail_l.addWidget(w)
        rail_l.addStretch(1)
        main.addWidget(self.lbl_status)
        main.addWidget(self.status_rail)
        self.stack = QtWidgets.QStackedWidget()
        main.addWidget(self.stack, 1)
        body.addWidget(self.left_nav_card)
        body.addLayout(main, 1)
        root.addLayout(body, 1)

        # Page 1: Toolkit
        toolkit_page = QtWidgets.QWidget()
        toolkit_page_layout = QtWidgets.QVBoxLayout(toolkit_page)
        toolkit_page_layout.setContentsMargins(0, 0, 0, 0)
        toolkit_page_layout.setSpacing(14)
        toolkit_split = QtWidgets.QSplitter(QtCore.Qt.Horizontal)
        toolkit_split.setChildrenCollapsible(False)

        toolkit_actions_card = QtWidgets.QFrame()
        toolkit_actions_card.setObjectName("ToolkitCard")
        actions_l = QtWidgets.QVBoxLayout(toolkit_actions_card)
        actions_l.setContentsMargins(14, 14, 14, 14)
        actions_l.setSpacing(8)
        btn_back_dashboard = AnimatedButton("← Dashboard (Web)", self.style().standardIcon(QtWidgets.QStyle.SP_ArrowBack))
        btn_back_dashboard.setObjectName("SecondaryAction")
        btn_back_dashboard.setMinimumHeight(32)
        btn_back_dashboard.clicked.connect(self._switch_toolkit_to_web)
        actions_l.addWidget(btn_back_dashboard)
        actions_title = QtWidgets.QLabel("MyDJToolkit Jobs")
        actions_title.setObjectName("H2Text")
        actions_l.addWidget(actions_title)
        btn_exact = AnimatedButton("Open Full Toolkit Menu (Exact PowerShell)", self.style().standardIcon(QtWidgets.QStyle.SP_CommandLink))
        btn_exact.setObjectName("ToolPrimary")
        btn_exact.clicked.connect(self.run_toolkit_full_menu)
        actions_l.addWidget(btn_exact)

        toolkit_scroll = SmoothScrollArea()
        toolkit_scroll.setWidgetResizable(True)
        toolkit_scroll.setFrameShape(QtWidgets.QFrame.NoFrame)
        toolkit_content = QtWidgets.QWidget()
        tools_l = QtWidgets.QVBoxLayout(toolkit_content)
        tools_l.setContentsMargins(0, 0, 0, 0)
        tools_l.setSpacing(8)
        filter_row = QtWidgets.QHBoxLayout()
        filter_row.setSpacing(6)
        self.section_filter_group = QtWidgets.QButtonGroup(self)
        for sec_name in ["ALL", "DOWNLOADERS", "AUDIO", "PRODUCER TOOLS"]:
            b = AnimatedButton(sec_name.title() if sec_name != "PRODUCER TOOLS" else "Producer", with_shadow=False)
            b.setCheckable(True)
            b.setMinimumHeight(32)
            b.setObjectName("SecondaryAction")
            if sec_name == "ALL":
                b.setChecked(True)
            b.clicked.connect(lambda _=False, s=sec_name: self.set_tool_section_filter(s))
            self.section_filter_group.addButton(b)
            filter_row.addWidget(b)
        tools_l.addLayout(filter_row)
        self.tool_buttons_host = QtWidgets.QVBoxLayout()
        self.tool_buttons_host.setSpacing(8)
        tools_l.addLayout(self.tool_buttons_host)
        tools_l.addStretch(1)

        self._tool_button_specs = [
            {"section": "DOWNLOADERS", "text": "Main MP4 Download", "option": "1", "icon": QtWidgets.QStyle.SP_DialogSaveButton},
            {"section": "DOWNLOADERS", "text": "Backup MP4 Download", "option": "2", "icon": QtWidgets.QStyle.SP_DriveHDIcon},
            {"section": "DOWNLOADERS", "text": "Download with Cookies", "option": "3", "icon": QtWidgets.QStyle.SP_DialogYesButton},
            {"section": "DOWNLOADERS", "text": "TikTok Tools", "option": "4", "icon": QtWidgets.QStyle.SP_MediaPlay},
            {"section": "AUDIO", "text": "YouTube to MP3", "option": "5", "icon": QtWidgets.QStyle.SP_MediaVolume},
            {"section": "AUDIO", "text": "MP3 + Image to MP4", "option": "6", "icon": QtWidgets.QStyle.SP_FileDialogContentsView},
            {"section": "AUDIO", "text": "Video to MP3 (Local)", "option": "7", "icon": QtWidgets.QStyle.SP_MediaSeekForward},
            {"section": "PRODUCER TOOLS", "text": "Separate Stems (Demucs)", "option": "13", "icon": QtWidgets.QStyle.SP_FileDialogDetailedView},
            {"section": "PRODUCER TOOLS", "text": "Detect BPM", "option": "14", "icon": QtWidgets.QStyle.SP_BrowserReload},
            {"section": "PRODUCER TOOLS", "text": "Detect Key (Camelot)", "option": "15", "icon": QtWidgets.QStyle.SP_DialogApplyButton},
        ]
        self._rebuild_tool_buttons()
        toolkit_scroll.setWidget(toolkit_content)
        actions_l.addWidget(toolkit_scroll, 1)

        toolkit_console_card = QtWidgets.QFrame()
        toolkit_console_card.setObjectName("ToolkitCard")
        console_l = QtWidgets.QVBoxLayout(toolkit_console_card)
        console_l.setContentsMargins(14, 14, 14, 14)
        console_l.setSpacing(8)
        c_title = QtWidgets.QLabel("Toolkit Status")
        c_title.setObjectName("H2Text")
        console_l.addWidget(c_title)

        now_playing = QtWidgets.QLabel("Current Task")
        now_playing.setObjectName("MinorText")
        console_l.addWidget(now_playing)
        self.lbl_toolkit_task = QtWidgets.QLabel("")
        self.lbl_toolkit_task.setStyleSheet("font-size:24px;font-weight:700;color:#f4f7ff;")
        self.lbl_toolkit_task.setWordWrap(True)
        console_l.addWidget(self.lbl_toolkit_task)

        self.lbl_toolkit_status = QtWidgets.QLabel("")
        self.lbl_toolkit_status.setObjectName("StatusPill")
        self.lbl_toolkit_status.setSizePolicy(QtWidgets.QSizePolicy.Maximum, QtWidgets.QSizePolicy.Fixed)
        self.lbl_toolkit_status.setMinimumHeight(30)
        self.lbl_toolkit_status.setAlignment(QtCore.Qt.AlignCenter)
        console_l.addWidget(self.lbl_toolkit_status)

        self.toolkit_progress = QtWidgets.QProgressBar()
        self.toolkit_progress.setRange(0, 100)
        self.toolkit_progress.setValue(0)
        self.toolkit_progress.setFormat("%p%")
        self.toolkit_progress.setAlignment(QtCore.Qt.AlignRight | QtCore.Qt.AlignVCenter)
        self.toolkit_progress.setFixedHeight(32)
        console_l.addWidget(self.toolkit_progress)
        self._progress_glow = QtWidgets.QGraphicsDropShadowEffect(self.toolkit_progress)
        self._progress_glow.setBlurRadius(0.0)
        self._progress_glow.setOffset(0, 0)
        self._progress_glow.setColor(QtGui.QColor(147, 79, 255, 0))
        self.toolkit_progress.setGraphicsEffect(self._progress_glow)
        self._glow_pulse = QtCore.QVariantAnimation(self)
        self._glow_pulse.setDuration(1800)
        self._glow_pulse.setLoopCount(-1)
        self._glow_pulse.setStartValue(12.0)
        self._glow_pulse.setKeyValueAt(0.5, 22.0)
        self._glow_pulse.setEndValue(12.0)
        self._glow_pulse.valueChanged.connect(self._on_glow_pulse)
        self._toolkit_progress_anim = QtCore.QPropertyAnimation(self.toolkit_progress, b"value", self)
        self._toolkit_progress_anim.setDuration(190)
        self._toolkit_progress_anim.setEasingCurve(QtCore.QEasingCurve.OutCubic)
        self._bar_accent_anim = QtCore.QVariantAnimation(self)
        self._bar_accent_anim.setDuration(1900)
        self._bar_accent_anim.setLoopCount(-1)
        self._bar_accent_anim.setStartValue(0.0)
        self._bar_accent_anim.setEndValue(1.0)
        self._bar_accent_anim.valueChanged.connect(self._on_bar_accent_phase)
        self._status_base_color = QtGui.QColor(63, 77, 122, 190)
        self._status_pulse = QtCore.QVariantAnimation(self)
        self._status_pulse.setDuration(1600)
        self._status_pulse.setLoopCount(-1)
        self._status_pulse.setStartValue(0.96)
        self._status_pulse.setKeyValueAt(0.5, 1.04)
        self._status_pulse.setEndValue(0.96)
        self._status_pulse.valueChanged.connect(self._on_status_pulse)
        self.lbl_toolkit_eta = QtWidgets.QLabel("ETA: --:--")
        self.lbl_toolkit_eta.setObjectName("MinorText")
        progress_row = QtWidgets.QHBoxLayout()
        progress_row.setSpacing(8)
        progress_row.addWidget(self.lbl_toolkit_eta)
        progress_row.addStretch(1)
        self.btn_stop_toolkit = AnimatedButton("Stop")
        self.btn_stop_toolkit.setObjectName("StopGhost")
        self.btn_stop_toolkit.clicked.connect(self.stop_toolkit_process)
        self.btn_stop_toolkit.setVisible(False)
        progress_row.addWidget(self.btn_stop_toolkit)
        console_l.addLayout(progress_row)

        save_title = QtWidgets.QLabel("Saving to")
        save_title.setObjectName("MinorText")
        self.lbl_save_title = save_title
        console_l.addWidget(self.lbl_save_title)
        path_row = QtWidgets.QHBoxLayout()
        path_row.setSpacing(8)
        self.lbl_folder_icon = QtWidgets.QLabel("📁")
        self.lbl_folder_icon.setStyleSheet("font-size:16px;")
        self.btn_path_link = QtWidgets.QPushButton("DJDownloads > MP4")
        self.btn_path_link.setObjectName("PathLink")
        self.btn_path_link.clicked.connect(self.open_last_folder)
        self.btn_open_path_inline = AnimatedButton("Open", with_shadow=False)
        self.btn_open_path_inline.setObjectName("SecondaryAction")
        self.btn_open_path_inline.setMinimumHeight(28)
        self.btn_open_path_inline.clicked.connect(self.open_last_folder)
        path_row.addWidget(self.lbl_folder_icon)
        path_row.addWidget(self.btn_path_link, 1)
        path_row.addWidget(self.btn_open_path_inline)
        console_l.addLayout(path_row)
        self.lbl_toolkit_path_full = QtWidgets.QLabel("-")
        self.lbl_toolkit_path_full.setWordWrap(True)
        self.lbl_toolkit_path_full.setObjectName("MinorText")
        console_l.addWidget(self.lbl_toolkit_path_full)
        self.lbl_toolkit_speed = QtWidgets.QLabel("-- MB/s")
        self.lbl_toolkit_speed.setObjectName("MinorText")
        console_l.addWidget(self.lbl_toolkit_speed)

        self.lbl_toolkit_result = QtWidgets.QLabel("")
        self.lbl_toolkit_result.setWordWrap(True)
        self.lbl_toolkit_result.setObjectName("MinorText")
        console_l.addWidget(self.lbl_toolkit_result)
        err_actions = QtWidgets.QHBoxLayout()
        self.btn_retry_error = AnimatedButton("Retry")
        self.btn_open_logs = AnimatedButton("Open Logs")
        self.btn_retry_error.setMinimumHeight(30)
        self.btn_open_logs.setMinimumHeight(30)
        self.btn_retry_error.clicked.connect(self.retry_last_job)
        self.btn_open_logs.clicked.connect(self.open_toolkit_logs)
        self.btn_retry_error.setVisible(False)
        self.btn_open_logs.setVisible(False)
        err_actions.addWidget(self.btn_retry_error)
        err_actions.addWidget(self.btn_open_logs)
        err_actions.addStretch(1)
        console_l.addLayout(err_actions)

        self.recent_card = QtWidgets.QFrame()
        self.recent_card.setObjectName("ToolkitSubCard")
        rc_l = QtWidgets.QVBoxLayout(self.recent_card)
        rc_l.setContentsMargins(10, 10, 10, 10)
        rc_l.setSpacing(6)
        recent_top = QtWidgets.QHBoxLayout()
        recent_title = QtWidgets.QLabel("Recent Jobs")
        recent_title.setObjectName("MinorText")
        recent_title.setStyleSheet("font-size:13px;font-weight:700;color:#c9d4f5;")
        self.cmb_recent_filter = QtWidgets.QComboBox()
        self.cmb_recent_filter.addItems(["All", "Success", "Failed"])
        self.cmb_recent_filter.currentTextChanged.connect(self.refresh_recent_jobs_list)
        self.btn_clear_recent = AnimatedButton("Clear")
        self.btn_clear_recent.setObjectName("SecondaryAction")
        self.btn_clear_recent.setMinimumHeight(30)
        self.btn_clear_recent.clicked.connect(self.clear_recent_jobs)
        recent_top.addWidget(recent_title)
        recent_top.addStretch(1)
        recent_top.addWidget(self.cmb_recent_filter)
        recent_top.addWidget(self.btn_clear_recent)
        self.list_recent_jobs = QtWidgets.QListWidget()
        self.list_recent_jobs.setMaximumHeight(140)
        self.list_recent_jobs.setMinimumHeight(90)
        self.list_recent_jobs.setFocusPolicy(QtCore.Qt.NoFocus)
        self.list_recent_jobs.setVerticalScrollMode(QtWidgets.QAbstractItemView.ScrollPerPixel)
        rc_l.addLayout(recent_top)
        rc_l.addWidget(self.list_recent_jobs)
        recent_actions = QtWidgets.QHBoxLayout()
        self.btn_retry_job = AnimatedButton("Retry")
        self.btn_retry_job.setMinimumHeight(30)
        self.btn_open_job_output = AnimatedButton("Open Output")
        self.btn_open_job_output.setMinimumHeight(30)
        self.btn_retry_job.clicked.connect(self.retry_selected_recent_job)
        self.btn_open_job_output.clicked.connect(self.open_selected_recent_output)
        recent_actions.addWidget(self.btn_retry_job)
        recent_actions.addWidget(self.btn_open_job_output)
        recent_actions.addStretch(1)
        rc_l.addLayout(recent_actions)
        self.recent_card.setVisible(False)
        console_l.addWidget(self.recent_card)

        self.complete_card = QtWidgets.QFrame()
        self.complete_card.setObjectName("ToolkitSubCard")
        cc = QtWidgets.QVBoxLayout(self.complete_card)
        cc.setContentsMargins(10, 10, 10, 10)
        cc.setSpacing(6)
        self.lbl_complete_title = QtWidgets.QLabel("✅ Download Complete")
        self.lbl_complete_title.setStyleSheet("font-size:18px;font-weight:700;color:#9de8ba;")
        self.lbl_complete_sub = QtWidgets.QLabel("File saved successfully")
        self.lbl_complete_sub.setObjectName("MinorText")
        complete_actions = QtWidgets.QHBoxLayout()
        self.btn_open_folder = AnimatedButton("Open Folder")
        self.btn_open_file = AnimatedButton("Open File")
        self.btn_open_folder.clicked.connect(self.open_last_folder)
        self.btn_open_file.clicked.connect(self.open_last_file)
        complete_actions.addWidget(self.btn_open_folder)
        complete_actions.addWidget(self.btn_open_file)
        complete_actions.addStretch(1)
        cc.addWidget(self.lbl_complete_title)
        cc.addWidget(self.lbl_complete_sub)
        cc.addLayout(complete_actions)
        self.complete_card.setVisible(False)
        console_l.addWidget(self.complete_card)
        self.lbl_bpm_result = QtWidgets.QLabel("")
        self.lbl_bpm_result.setStyleSheet("font-size:28px;font-weight:700;color:#f0f5ff;")
        self.lbl_bpm_result.setWordWrap(True)
        self.lbl_bpm_result.setVisible(False)
        console_l.addWidget(self.lbl_bpm_result)
        console_l.addStretch(1)

        activity_card = QtWidgets.QFrame()
        activity_card.setObjectName("ToolkitActivity")
        activity_l = QtWidgets.QVBoxLayout(activity_card)
        activity_l.setContentsMargins(12, 12, 12, 12)
        activity_l.setSpacing(10)
        activity_title = QtWidgets.QLabel("Activity Hub")
        activity_title.setObjectName("H2Text")
        activity_l.addWidget(activity_title)
        self.lbl_activity_state = QtWidgets.QLabel("Idle")
        self.lbl_activity_state.setObjectName("MinorText")
        activity_l.addWidget(self.lbl_activity_state)
        self.lbl_activity_task = QtWidgets.QLabel("No active task")
        self.lbl_activity_task.setWordWrap(True)
        self.lbl_activity_task.setObjectName("MinorText")
        activity_l.addWidget(self.lbl_activity_task)
        self.activity_progress = QtWidgets.QProgressBar()
        self.activity_progress.setRange(0, 100)
        self.activity_progress.setValue(0)
        self.activity_progress.setFormat("%p%")
        self.activity_progress.setFixedHeight(20)
        activity_l.addWidget(self.activity_progress)
        self.lbl_activity_eta = QtWidgets.QLabel("--")
        self.lbl_activity_eta.setObjectName("MinorText")
        activity_l.addWidget(self.lbl_activity_eta)
        line = QtWidgets.QFrame()
        line.setFrameShape(QtWidgets.QFrame.HLine)
        line.setStyleSheet("background: rgba(120,140,190,0.25); min-height:1px; max-height:1px; border:0;")
        activity_l.addWidget(line)
        act_top = QtWidgets.QHBoxLayout()
        act_recent_title = QtWidgets.QLabel("Recent Jobs")
        act_recent_title.setObjectName("MinorText")
        self.btn_activity_clear = AnimatedButton("Clear", with_shadow=False)
        self.btn_activity_clear.setObjectName("SecondaryAction")
        self.btn_activity_clear.setMinimumHeight(28)
        self.btn_activity_clear.clicked.connect(self.clear_recent_jobs)
        act_top.addWidget(act_recent_title)
        act_top.addStretch(1)
        act_top.addWidget(self.btn_activity_clear)
        activity_l.addLayout(act_top)
        self.list_activity_jobs = QtWidgets.QListWidget()
        self.list_activity_jobs.setFocusPolicy(QtCore.Qt.NoFocus)
        self.list_activity_jobs.setVerticalScrollMode(QtWidgets.QAbstractItemView.ScrollPerPixel)
        activity_l.addWidget(self.list_activity_jobs, 1)

        toolkit_console_scroll = SmoothScrollArea()
        toolkit_console_scroll.setWidgetResizable(True)
        toolkit_console_scroll.setFrameShape(QtWidgets.QFrame.NoFrame)
        toolkit_console_scroll.setHorizontalScrollBarPolicy(QtCore.Qt.ScrollBarAlwaysOff)
        toolkit_console_scroll.setWidget(toolkit_console_card)

        toolkit_split.addWidget(toolkit_actions_card)
        toolkit_split.addWidget(toolkit_console_scroll)
        toolkit_split.addWidget(activity_card)
        toolkit_split.setStretchFactor(0, 4)
        toolkit_split.setStretchFactor(1, 5)
        toolkit_split.setStretchFactor(2, 3)
        toolkit_split.setSizes([460, 680, 360])
        self._toolkit_webview = self._build_toolkit_home_widget()
        self._toolkit_legacy_panel = toolkit_split
        self._toolkit_stack = QtWidgets.QStackedWidget()
        self._toolkit_stack.addWidget(self._toolkit_webview)
        self._toolkit_stack.addWidget(self._toolkit_legacy_panel)
        self._toolkit_stack.setCurrentIndex(0)
        toolkit_page_layout.addWidget(self._toolkit_stack, 1)
        self.stack.addWidget(toolkit_page)

        # Page 2: Copyright
        copyright_page = QtWidgets.QWidget()
        cp_layout = QtWidgets.QVBoxLayout(copyright_page)
        cp_layout.setContentsMargins(0, 0, 0, 0)
        cp_layout.setSpacing(14)
        content = QtWidgets.QHBoxLayout()
        content.setSpacing(14)

        center_card = QtWidgets.QFrame()
        center_card.setObjectName("Card")
        c_l = QtWidgets.QVBoxLayout(center_card)
        c_l.setContentsMargins(14, 14, 14, 14)
        c_l.setSpacing(8)
        c_title = QtWidgets.QLabel("Copyright Testing")
        c_title.setObjectName("H2Text")
        c_l.addWidget(c_title)
        filter_row = QtWidgets.QHBoxLayout()
        self.filter_group = QtWidgets.QButtonGroup(self)
        for f in ["All", RESULT_BLOCKED, RESULT_CLAIMED, RESULT_NO_CLAIM]:
            b = AnimatedButton(f.replace("_", " "))
            b.setCheckable(True)
            if f == "All":
                b.setChecked(True)
            self.filter_group.addButton(b)
            filter_row.addWidget(b)
            b.clicked.connect(lambda _=False, ff=f: self.set_filter(ff))
        c_l.addLayout(filter_row)

        action = QtWidgets.QHBoxLayout()
        self.lbl_selected = QtWidgets.QLabel("Selected: None")
        self.lbl_selected.setObjectName("MinorText")
        self.lbl_selected.setSizePolicy(QtWidgets.QSizePolicy.Ignored, QtWidgets.QSizePolicy.Preferred)
        self.lbl_selected.setMinimumWidth(220)
        action.addWidget(self.lbl_selected, 1)
        b_select_all = AnimatedButton("Select All")
        b_select_all.setObjectName("SecondaryAction")
        b_select_all.setMinimumHeight(34)
        b_select_all.clicked.connect(self.select_all_files)
        action.addWidget(b_select_all)
        b_block = AnimatedButton("Mark as Blocked")
        b_claim = AnimatedButton("Claimed")
        b_clean = AnimatedButton("No Claim")
        b_block.setObjectName("DangerAction")
        b_claim.setObjectName("SuccessAction")
        b_block.clicked.connect(lambda: self.mark_selected(RESULT_BLOCKED))
        b_claim.clicked.connect(lambda: self.mark_selected(RESULT_CLAIMED))
        b_clean.clicked.connect(lambda: self.mark_selected(RESULT_NO_CLAIM))
        action.addWidget(b_block)
        action.addWidget(b_claim)
        action.addWidget(b_clean)
        c_l.addLayout(action)

        self.list_files = QtWidgets.QListWidget()
        self.list_files.setUniformItemSizes(True)
        self.list_files.setSelectionMode(QtWidgets.QAbstractItemView.ExtendedSelection)
        self.list_files.setTextElideMode(QtCore.Qt.ElideRight)
        self.list_files.setHorizontalScrollBarPolicy(QtCore.Qt.ScrollBarAlwaysOff)
        self.list_files.setVerticalScrollMode(QtWidgets.QAbstractItemView.ScrollPerPixel)
        self.list_files.setContextMenuPolicy(QtCore.Qt.CustomContextMenu)
        self.list_files.customContextMenuRequested.connect(self.show_file_context_menu)
        self.list_files.itemSelectionChanged.connect(self.on_select_item)
        c_l.addWidget(self.list_files, 1)
        page_row = QtWidgets.QHBoxLayout()
        btn_prev = AnimatedButton("< Prev")
        btn_next = AnimatedButton("Next >")
        self.lbl_page = QtWidgets.QLabel("Page 1 / 1")
        self.lbl_page.setObjectName("MinorText")
        btn_prev.clicked.connect(self.prev_page)
        btn_next.clicked.connect(self.next_page)
        page_row.addWidget(btn_prev)
        page_row.addWidget(self.lbl_page)
        page_row.addWidget(btn_next)
        page_row.addStretch(1)
        c_l.addLayout(page_row)

        right_card = QtWidgets.QFrame()
        right_card.setObjectName("Card")
        right_card.setMinimumWidth(350)
        right_card.setMaximumWidth(430)
        r_l = QtWidgets.QVBoxLayout(right_card)
        r_l.setContentsMargins(14, 14, 14, 14)
        r_l.setSpacing(8)
        r_title = QtWidgets.QLabel("Scan Results")
        r_title.setObjectName("H2Text")
        r_l.addWidget(r_title)
        self.lbl_total = QtWidgets.QLabel("Files in /To_Test: 0")
        self.lbl_skipped = QtWidgets.QLabel("Already Tested: 0")
        self.lbl_new = QtWidgets.QLabel("New Files Found: 0")
        self.lbl_new.setStyleSheet("color:#ff748b;font-weight:700;")
        r_l.addWidget(self.lbl_total)
        r_l.addWidget(self.lbl_skipped)
        r_l.addWidget(self.lbl_new)
        self.btn_scan = AnimatedButton("Scan Folder / Files")
        self.btn_scan.setObjectName("PrimaryAction")
        self.btn_scan.clicked.connect(self.scan_folder)
        r_l.addWidget(self.btn_scan)
        btn_old = AnimatedButton("Show Old Files")
        btn_old.clicked.connect(self.show_old_files_dialog)
        r_l.addWidget(btn_old)
        self.progress = QtWidgets.QProgressBar()
        r_l.addWidget(self.progress)
        self.lbl_progress = QtWidgets.QLabel("Scanning: 0 / 0 files")
        self.lbl_hashing = QtWidgets.QLabel("Currently hashing: -")
        self.lbl_progress.setObjectName("MinorText")
        self.lbl_hashing.setObjectName("MinorText")
        self.lbl_hashing.setWordWrap(True)
        r_l.addWidget(self.lbl_progress)
        r_l.addWidget(self.lbl_hashing)
        r_l.addStretch(1)

        content.addWidget(center_card, 2)
        content.addWidget(right_card, 1)
        cp_layout.addLayout(content, 1)

        stats_card = QtWidgets.QFrame()
        stats_card.setObjectName("Card")
        s_l = QtWidgets.QHBoxLayout(stats_card)
        s_l.setContentsMargins(14, 12, 14, 12)
        s_l.setSpacing(14)
        self.s_block = QtWidgets.QLabel("Blocked 0 (0.0%)")
        self.s_claim = QtWidgets.QLabel("Claimed 0")
        self.s_clean = QtWidgets.QLabel("No Claim 0")
        self.s_total = QtWidgets.QLabel("Total Tested 0")
        self.s_risk = QtWidgets.QLabel("Estimated Block Risk 0.0%")
        self.s_block.setStyleSheet("color:#ff7289;font-weight:800;font-size:20px;")
        self.s_claim.setStyleSheet("color:#8ad7af;font-weight:700;font-size:20px;")
        self.s_clean.setStyleSheet("font-weight:700;font-size:20px;")
        self.s_total.setStyleSheet("font-weight:700;font-size:20px;")
        self.s_risk.setStyleSheet("color:#ffc06d;font-weight:700;font-size:20px;")
        for w in [self.s_block, self.s_claim, self.s_clean, self.s_total, self.s_risk]:
            s_l.addWidget(w)
            s_l.addSpacing(6)
        cp_layout.addWidget(stats_card)
        self.stack.addWidget(copyright_page)

        # Page 3: Key Detection
        key_page = QtWidgets.QWidget()
        key_layout = QtWidgets.QVBoxLayout(key_page)
        key_layout.setContentsMargins(0, 0, 0, 0)
        key_layout.setSpacing(14)
        key_card = QtWidgets.QFrame()
        key_card.setObjectName("Card")
        key_card_l = QtWidgets.QVBoxLayout(key_card)
        key_card_l.setContentsMargins(18, 18, 18, 18)
        key_card_l.setSpacing(10)
        key_title = QtWidgets.QLabel("Key Detection")
        key_title.setObjectName("H2Text")
        key_sub = QtWidgets.QLabel("Analyze musical key + Camelot notation from local audio files.")
        key_sub.setObjectName("MinorText")
        key_sub.setWordWrap(True)
        self.lbl_keydetect_last = QtWidgets.QLabel("No key analysis run yet.")
        self.lbl_keydetect_last.setObjectName("MinorText")
        self.lbl_keydetect_last.setWordWrap(True)
        btn_run_key = AnimatedButton("Run Key Detection")
        btn_run_key.setObjectName("PrimaryAction")
        btn_run_key.setMinimumHeight(40)
        btn_run_key.clicked.connect(lambda: self.run_toolkit_option("15"))
        key_card_l.addWidget(key_title)
        key_card_l.addWidget(key_sub)
        key_card_l.addWidget(btn_run_key)
        key_card_l.addWidget(self.lbl_keydetect_last)
        key_card_l.addStretch(1)
        key_layout.addWidget(key_card, 1)
        self.stack.addWidget(key_page)

        # Page 4: Settings
        settings_page = QtWidgets.QWidget()
        st_layout = QtWidgets.QVBoxLayout(settings_page)
        st_layout.setContentsMargins(0, 0, 0, 0)
        st_layout.setSpacing(14)
        settings_card = QtWidgets.QFrame()
        settings_card.setObjectName("Card")
        settings_l = QtWidgets.QVBoxLayout(settings_card)
        settings_l.setContentsMargins(18, 18, 18, 18)
        settings_l.setSpacing(12)
        st_title = QtWidgets.QLabel("Settings")
        st_title.setObjectName("H2Text")
        st_desc = QtWidgets.QLabel("App appearance and workflow preferences.")
        st_desc.setObjectName("MinorText")
        row_theme = QtWidgets.QHBoxLayout()
        lbl_theme = QtWidgets.QLabel("Theme")
        lbl_theme.setObjectName("MinorText")
        row_theme.addWidget(lbl_theme)
        row_theme.addStretch(1)
        self.cmb_theme_settings = QtWidgets.QComboBox()
        self.cmb_theme_settings.addItems(["Dark", "Light"])
        self.cmb_theme_settings.setCurrentText(self.cmb_theme.currentText())
        self.cmb_theme_settings.currentTextChanged.connect(self.on_theme_changed)
        row_theme.addWidget(self.cmb_theme_settings)
        row_density = QtWidgets.QHBoxLayout()
        lbl_density = QtWidgets.QLabel("Density")
        lbl_density.setObjectName("MinorText")
        row_density.addWidget(lbl_density)
        row_density.addStretch(1)
        self.cmb_density_settings = QtWidgets.QComboBox()
        self.cmb_density_settings.addItems(["Comfortable", "Compact"])
        self.cmb_density_settings.setCurrentText(self.cmb_density.currentText())
        self.cmb_density_settings.currentTextChanged.connect(self.on_density_changed)
        row_density.addWidget(self.cmb_density_settings)
        self.chk_shortcuts = QtWidgets.QCheckBox("Enable keyboard shortcuts")
        self.chk_shortcuts.setChecked(bool(self.config.get("keyboard_shortcuts", True)))
        self.chk_auto_dup = QtWidgets.QCheckBox("Auto-move duplicates")
        self.chk_auto_dup.setChecked(bool(self.config.get("auto_move_duplicates", True)))
        self.chk_block_severity = QtWidgets.QCheckBox("Track block severity")
        self.chk_block_severity.setChecked(bool(self.config.get("track_block_severity", True)))
        btn_save_settings = AnimatedButton("Save Settings")
        btn_save_settings.setObjectName("PrimaryAction")
        btn_save_settings.clicked.connect(self.open_settings_dialog)
        settings_l.addWidget(st_title)
        settings_l.addWidget(st_desc)
        settings_l.addLayout(row_theme)
        settings_l.addLayout(row_density)
        settings_l.addWidget(self.chk_shortcuts)
        settings_l.addWidget(self.chk_auto_dup)
        settings_l.addWidget(self.chk_block_severity)
        settings_l.addWidget(btn_save_settings)
        settings_l.addStretch(1)
        st_layout.addWidget(settings_card, 1)
        self.stack.addWidget(settings_page)

        for card in [
            toolkit_actions_card,
            toolkit_console_card,
            activity_card,
            self.left_nav_card,
            center_card,
            right_card,
            stats_card,
            key_card,
            settings_card,
        ]:
            self._apply_card_shadow(card)
        self._apply_status_rail_shadow(self.status_rail)

        self.show_toolkit_page()

    def show_toolkit_page(self) -> None:
        self.stack.setCurrentIndex(0)
        # Legacy/native toolkit workflow is disabled; always keep web UI active.
        use_web = True
        if hasattr(self, "_toolkit_stack"):
            self._toolkit_stack.setCurrentIndex(0 if use_web else 1)
        self.btn_nav_toolkit.setChecked(True)
        self.btn_nav_copyright.setChecked(False)
        self.btn_nav_key.setChecked(False)
        self.btn_nav_settings.setChecked(False)
        if hasattr(self, "header_widget"):
            self.header_widget.setVisible(not use_web)
        if hasattr(self, "root_layout"):
            if use_web:
                self.root_layout.setContentsMargins(0, 0, 0, 0)
                self.root_layout.setSpacing(0)
            else:
                self.root_layout.setContentsMargins(14, 12, 14, 12)
                self.root_layout.setSpacing(14)
        self.status_rail.setVisible(not use_web)
        self.lbl_status.setVisible(not use_web)
        if hasattr(self, "left_nav_card"):
            self.left_nav_card.setVisible(not use_web)
        self.lbl_status.setText("MyDJToolkit ready.")

    def _show_toolkit_workflow(self) -> None:
        # Legacy/native toolkit workflow is intentionally disabled.
        self._switch_toolkit_to_web()
        self.lbl_status.setVisible(True)
        self.lbl_status.setText("Classic workflow is disabled. Staying on new UI.")

    def show_copyright_page(self) -> None:
        self.stack.setCurrentIndex(1)
        self.btn_nav_copyright.setChecked(True)
        self.btn_nav_toolkit.setChecked(False)
        self.btn_nav_key.setChecked(False)
        self.btn_nav_settings.setChecked(False)
        if hasattr(self, "header_widget"):
            self.header_widget.setVisible(True)
        if hasattr(self, "root_layout"):
            self.root_layout.setContentsMargins(14, 12, 14, 12)
            self.root_layout.setSpacing(14)
        self.status_rail.setVisible(False)
        self.lbl_status.setVisible(True)
        if hasattr(self, "left_nav_card"):
            self.left_nav_card.setVisible(True)
        self.lbl_status.setText("Copyright tools ready.")

    def show_key_page(self) -> None:
        self.stack.setCurrentIndex(2)
        self.btn_nav_key.setChecked(True)
        self.btn_nav_toolkit.setChecked(False)
        self.btn_nav_copyright.setChecked(False)
        self.btn_nav_settings.setChecked(False)
        if hasattr(self, "header_widget"):
            self.header_widget.setVisible(True)
        if hasattr(self, "root_layout"):
            self.root_layout.setContentsMargins(14, 12, 14, 12)
            self.root_layout.setSpacing(14)
        self.status_rail.setVisible(True)
        self.lbl_status.setVisible(True)
        if hasattr(self, "left_nav_card"):
            self.left_nav_card.setVisible(True)
        self.lbl_status.setText("Key detection ready.")

    def show_settings_page(self) -> None:
        self.stack.setCurrentIndex(3)
        self.btn_nav_settings.setChecked(True)
        self.btn_nav_toolkit.setChecked(False)
        self.btn_nav_copyright.setChecked(False)
        self.btn_nav_key.setChecked(False)
        if hasattr(self, "header_widget"):
            self.header_widget.setVisible(True)
        if hasattr(self, "root_layout"):
            self.root_layout.setContentsMargins(14, 12, 14, 12)
            self.root_layout.setSpacing(14)
        self.status_rail.setVisible(False)
        self.lbl_status.setVisible(True)
        if hasattr(self, "left_nav_card"):
            self.left_nav_card.setVisible(True)
        self.lbl_status.setText("Settings ready.")

    def _apply_card_shadow(self, widget: QtWidgets.QWidget) -> None:
        shadow = QtWidgets.QGraphicsDropShadowEffect(widget)
        shadow.setBlurRadius(14.0)
        shadow.setOffset(0, 3)
        shadow.setColor(QtGui.QColor(0, 0, 0, 55))
        widget.setGraphicsEffect(shadow)

    def _apply_status_rail_shadow(self, widget: QtWidgets.QWidget) -> None:
        shadow = QtWidgets.QGraphicsDropShadowEffect(widget)
        shadow.setBlurRadius(20.0)
        shadow.setOffset(0, 5)
        shadow.setColor(QtGui.QColor(10, 16, 34, 120))
        widget.setGraphicsEffect(shadow)

    def _theme_stylesheet(self, theme: str) -> str:
        if theme == "light":
            return """
            #AppRoot { background: #f3f6fb; color:#1c2436; font-family: "Inter", "Roboto", "Segoe UI", sans-serif; font-size:14px; }
            QFrame#Card {
                background:qlineargradient(x1:0,y1:0,x2:0,y2:1, stop:0 #ffffff, stop:1 #fbfcff);
                border:1px solid #dbe2ee;
                border-top:1px solid #eef2fa;
                border-bottom:1px solid #cfd8ea;
                border-radius:14px;
            }
            QFrame#ToolkitActivity {
                background:qlineargradient(x1:0,y1:0,x2:0,y2:1, stop:0 #fbfcff, stop:1 #f3f7ff);
                border:1px solid #d5dff1;
                border-radius:14px;
            }
            QFrame#StatusRail {
                background:qlineargradient(x1:0,y1:0,x2:0,y2:1, stop:0 #ffffff, stop:0.52 #f4f7ff, stop:1 #e9eefb);
                border:1px solid #d4ddef;
                border-top:1px solid #f7f9ff;
                border-bottom:1px solid #c5d0e8;
                border-radius:16px;
            }
            QLabel#TitleText { font-size:30px; font-weight:800; color:#1d2740; }
            QLabel#H2Text { font-size:18px; font-weight:700; color:#2a3857; }
            QLabel#MinorText { color:#5f6f91; font-size:13px; }
            QLabel#StatusPill { border-radius:14px; padding:4px 10px; background:#e6ebf8; color:#2f3c57; font-weight:600; }
            QPushButton { background:#f5f7fc; border:1px solid #d5ddec; border-radius:14px; padding:8px 12px; color:#2b3855; }
            QPushButton:hover { background:#ecf1fb; }
            QPushButton:pressed { background:#e2e9f7; }
            QPushButton[role="topnav"]:checked { background:#3f75e6; border:1px solid #2f61cc; color:#ffffff; }
            QPushButton#SideIcon { background:#eef2fa; border:1px solid #d7dfec; border-radius:12px; min-width:36px; max-width:44px; min-height:34px; max-height:40px; padding:4px; }
            QPushButton#SideIcon:hover { background:#e4ebf8; border:1px solid #c8d5ea; }
            QPushButton#SideIcon:checked { background:#d8e4ff; border:1px solid #8dafff; }
            QPushButton#PrimaryAction { background:#e85a9f; border:1px solid #db4a8f; color:#ffffff; font-weight:700; }
            QPushButton#PrimaryAction:hover { background:#d84f92; border:1px solid #f19aca; }
            QPushButton#PrimaryAction:pressed { background:#c54583; border:1px solid #e586bc; }
            QPushButton#ToolPrimary { background:#e85a9f; border:1px solid #db4a8f; color:#ffffff; font-weight:700; min-height:40px; text-align:left; padding:6px 14px; }
            QPushButton#ToolPrimary:hover { background:#d84f92; border:1px solid #f19aca; }
            QPushButton#ToolSecondary { background:#eef2fa; border:1px solid #d7dfec; color:#3c4b69; min-height:40px; text-align:left; padding:6px 14px; }
            QPushButton#ToolSecondary:hover { background:#e2eaf7; border:1px solid #cbd7ec; }
            QPushButton#DangerAction { background:#d74e7a; color:#ffffff; }
            QPushButton#SuccessAction { background:#33a46b; border:1px solid #258b57; color:#ffffff; }
            QPushButton#SecondaryAction { background:#eef2fa; color:#3c4b69; }
            QPushButton#StopGhost { background:rgba(215,78,122,0.10); border:1px solid rgba(215,78,122,0.38); color:#b63e67; min-height:34px; padding:6px 12px; }
            QPushButton#PathLink {
                background: transparent;
                border: 0px;
                color: #2f61cc;
                text-align: left;
                padding: 0px;
                min-height: 28px;
                font-weight: 700;
            }
            QPushButton#PathLink:hover { color: #1f4fb8; text-decoration: underline; }
            QListWidget, QPlainTextEdit, QLineEdit, QComboBox { border:1px solid #d7dfec; border-radius:12px; background:#ffffff; padding:7px; color:#24314d; }
            QPlainTextEdit:focus, QLineEdit:focus { border:1px solid #8f46ff; }
            QListWidget::item { padding:8px 10px; border-radius:8px; }
            QListWidget::item:selected { background:#ece8ff; border:1px solid #cabfff; }
            QScrollBar:vertical { background:#edf2fa; width:11px; border-radius:5px; margin:4px 0; }
            QScrollBar::handle:vertical { background:#c4cee2; min-height:26px; border-radius:5px; }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height:0px; }
            QProgressBar { border:1px solid #d7dfec; border-radius:12px; text-align:right; padding-right:12px; background:#f4f7fd; min-height:28px; font-size:14px; font-weight:700; color:#3d4e70; }
            QProgressBar::chunk { background:qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #7b5df4, stop:1 #4f7fff); border-radius:11px; }
            """
        return """
        #AppRoot {
            background:qlineargradient(x1:0,y1:0,x2:1,y2:1, stop:0 #070b14, stop:0.45 #0a1230, stop:1 #0b0d16);
            color:#ebf0ff;
            font-family: "Inter", "Roboto", "Segoe UI", sans-serif;
            font-size:14px;
        }
        QFrame#Card {
            background:qlineargradient(x1:0,y1:0,x2:0,y2:1, stop:0 #121a2b, stop:1 #0f1626);
            border:1px solid #222c43;
            border-top:1px solid #303c57;
            border-bottom:1px solid #121827;
            border-radius:14px;
        }
        QFrame#ToolkitActivity {
            background:qlineargradient(x1:0,y1:0,x2:1,y2:1, stop:0 #161a22, stop:1 #131722);
            border:1px solid #2a3348;
            border-radius:14px;
        }
        QFrame#ToolkitCard {
            background:qlineargradient(x1:0,y1:0,x2:1,y2:1, stop:0 #121a32, stop:1 #0f172d);
            border:1px solid #2f3d62;
            border-radius:16px;
        }
        QFrame#ToolkitSubCard {
            background:qlineargradient(x1:0,y1:0,x2:1,y2:1, stop:0 #121a30, stop:1 #10162a);
            border:1px solid #2b395b;
            border-radius:14px;
        }
        QFrame#StatusRail {
            background:qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #111c33, stop:1 #0f1a30);
            border:1px solid #2d4f8b;
            border-radius:16px;
        }
        QLabel#TitleText { font-size:42px; font-weight:800; color:#f7f9ff; letter-spacing:0.2px; }
        QLabel#H2Text { font-size:18px; font-weight:700; color:#dbe5ff; }
        QLabel#MinorText { color:#8ea0cc; font-size:13px; }
        QLabel#StatusPill { border-radius:14px; padding:4px 10px; background:#25314e; color:#e9eeff; font-weight:600; }
        QPushButton { background:#1b2438; border:1px solid #2e3b5d; border-radius:14px; padding:8px 12px; color:#edf2ff; }
        QPushButton:hover { background:#232f49; }
        QPushButton:pressed { background:#182033; }
        QPushButton[role="topnav"]:checked {
            background:qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #37a5ff, stop:1 #6d54ff);
            border:1px solid #7d8dff;
            color:#ffffff;
        }
        QPushButton#SideIcon { background:#1a2337; border:1px solid #334562; border-radius:12px; min-width:36px; max-width:44px; min-height:34px; max-height:40px; padding:4px; }
        QPushButton#SideIcon:hover { background:#212d45; border:1px solid #45608a; }
        QPushButton#SideIcon:checked { background:#2f64d2; border:1px solid #5f8df3; }
        QPushButton#PrimaryAction { background:#d15195; border:1px solid #f18bc0; color:#ffffff; font-weight:700; }
        QPushButton#PrimaryAction:hover { background:#be4888; border:1px solid #f2a3cc; }
        QPushButton#PrimaryAction:pressed { background:#a93f79; border:1px solid #df8fba; }
        QPushButton#ToolPrimary {
            background:qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #d64aa2, stop:1 #7f58ff);
            border:1px solid #e08fd2;
            color:#ffffff;
            font-weight:700;
            min-height:40px;
            text-align:left;
            padding:6px 14px;
            border-radius:14px;
        }
        QPushButton#ToolPrimary:hover { background:qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #db57aa, stop:1 #8863ff); }
        QPushButton#ToolSecondary {
            background:qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #263551, stop:1 #2a3855);
            border:1px solid #3f537c;
            color:#dbe4fa;
            min-height:40px;
            text-align:left;
            padding:6px 14px;
            border-radius:14px;
        }
        QPushButton#ToolSecondary:hover { background:qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #2b3c5d, stop:1 #30405f); }
        QPushButton#DangerAction { background:#a84165; color:#ffffff; }
        QPushButton#SuccessAction { background:#2a8b5e; border:1px solid #3cab79; color:#ffffff; }
        QPushButton#SecondaryAction { background:#1a2234; color:#b7c4e6; }
        QPushButton#StopGhost { background:rgba(186,58,84,0.14); border:1px solid rgba(229,102,128,0.55); color:#ff98ab; min-height:34px; padding:6px 12px; }
        QPushButton#PathLink {
            background: transparent;
            border: 0px;
            color: #7ea6ff;
            text-align: left;
            padding: 0px;
            min-height: 28px;
            font-weight: 700;
        }
        QPushButton#PathLink:hover { color: #9abcff; text-decoration: underline; }
        QListWidget, QPlainTextEdit, QLineEdit, QComboBox { border:1px solid #2b3857; border-radius:12px; background:#0e1424; padding:7px; color:#ebf0ff; }
        QPlainTextEdit:focus, QLineEdit:focus { border:1px solid #8f46ff; background:#111a2e; }
        QListWidget::item { padding:8px 10px; border-radius:8px; }
        QListWidget::item:selected { background:#2b2850; border:1px solid #6157a2; }
        QScrollBar:vertical { background:#0b101d; width:11px; border-radius:5px; margin:4px 0; }
        QScrollBar::handle:vertical { background:#495779; min-height:26px; border-radius:5px; }
        QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height:0px; }
        QProgressBar { border:1px solid #2b3857; border-radius:12px; text-align:right; padding-right:12px; background:#0d1322; min-height:28px; font-size:14px; font-weight:700; }
        QProgressBar::chunk { background:qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #6a4ce8, stop:1 #3f6de6); border-radius:11px; }
        """

    def set_tool_section_filter(self, section: str) -> None:
        self._tool_section_filter = section
        self._rebuild_tool_buttons()

    def _rebuild_tool_buttons(self) -> None:
        while self.tool_buttons_host.count():
            item = self.tool_buttons_host.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.deleteLater()
        current_section = None
        for spec in self._tool_button_specs:
            if self._tool_section_filter != "ALL" and spec["section"] != self._tool_section_filter:
                continue
            if current_section != spec["section"]:
                current_section = spec["section"]
                sec = QtWidgets.QLabel(str(current_section))
                sec.setObjectName("MinorText")
                sec.setStyleSheet("font-size:11px;font-weight:700;letter-spacing:1.1px;color:#8ea0cc;")
                self.tool_buttons_host.addWidget(sec)
            if spec["option"] == "4":
                b = AnimatedButton(str(spec["text"]), with_shadow=False)
                b.setIcon(self.style().standardIcon(spec["icon"]))  # type: ignore[arg-type]
                b.setObjectName("ToolSecondary")
                menu = QtWidgets.QMenu(b)
                menu.addAction("Normal Queue", lambda: self.run_toolkit_option("4", forced_tiktok_mode="1"))
                menu.addAction("Sound Batch", lambda: self.run_toolkit_option("4", forced_tiktok_mode="2"))
                menu.addAction("TikTok to MP3", lambda: self.run_toolkit_option("4", forced_tiktok_mode="3"))
                b.clicked.connect(lambda _=False, m=menu, btn=b: m.exec(btn.mapToGlobal(QtCore.QPoint(0, btn.height()))))
            else:
                is_primary = str(spec["option"]) in {"1", "5"}
                b = AnimatedButton(str(spec["text"]), with_shadow=is_primary)
                b.setIcon(self.style().standardIcon(spec["icon"]))  # type: ignore[arg-type]
                if is_primary:
                    b.setObjectName("ToolPrimary")
                else:
                    b.setObjectName("ToolSecondary")
                b.clicked.connect(lambda _=False, option=str(spec["option"]): self.run_toolkit_option(option))
            b.setMinimumHeight(42)
            self.tool_buttons_host.addWidget(b)

    def _refresh_status_rail(self) -> None:
        self.rail_task.setText(f"Task: {self.lbl_toolkit_task.text()}")
        self.rail_state.setText(f"State: {self.lbl_toolkit_status.text()}")
        self.rail_speed.setText(self.lbl_toolkit_speed.text())
        self.rail_eta.setText(self.lbl_toolkit_eta.text())
        if hasattr(self, "lbl_activity_task"):
            task = self.lbl_toolkit_task.text().strip()
            self.lbl_activity_task.setText(task if task else "No active task")
        if hasattr(self, "lbl_activity_state"):
            state = self.lbl_toolkit_status.text().strip()
            self.lbl_activity_state.setText(state if state else "Idle")
        if hasattr(self, "lbl_activity_eta"):
            self.lbl_activity_eta.setText(self.lbl_toolkit_eta.text().strip() or "--")
        self._emit_web_status()

    def handle_bridge_command(self, command: Dict[str, object]) -> Dict[str, object]:
        cmd = str(command.get("command", "")).strip()
        payload = command.get("payload", {})
        if not isinstance(payload, dict):
            payload = {}
        req_id = str(command.get("requestId", "")).strip()
        response: Dict[str, object] = {
            "version": BRIDGE_CONTRACT_VERSION,
            "requestId": req_id,
            "ok": False,
        }
        try:
            if cmd == "toolkit.run_option":
                option = str(payload.get("option", "")).strip()
                run_payload = payload.get("payload", {})
                if not isinstance(run_payload, dict):
                    run_payload = {}
                if not option:
                    raise ValueError("Missing required field: payload.option")
                self.run_toolkit_option_direct(option, run_payload)
                response["ok"] = True
                response["data"] = {"accepted": True}
                return response
            if cmd == "toolkit.stop":
                self.stop_toolkit_process()
                response["ok"] = True
                response["data"] = {"accepted": True}
                return response
            if cmd == "system.pick_folder":
                key = str(payload.get("key", "")).strip().lower()
                current_path = str(payload.get("currentPath", "")).strip()
                picked = self.pick_output_folder(key, current_path)
                response["ok"] = True
                response["data"] = {"path": picked or ""}
                return response
            if cmd == "system.pick_files":
                mode = str(payload.get("mode", "")).strip().lower()
                trace_id = str(payload.get("traceId", "") or "").strip()
                files = self.pick_files_for_mode(mode)
                print(f"system.pick_files mode={mode or 'any'} selected={len(files)} trace={trace_id or '-'}")
                try:
                    dbg = self.base_dir / "Backups" / "picker_debug.log"
                    dbg.parent.mkdir(parents=True, exist_ok=True)
                    with dbg.open("a", encoding="utf-8") as fh:
                        fh.write(
                            f"{datetime.now().isoformat()} system.pick_files mode={mode or 'any'} "
                            f"selected={len(files)} trace={trace_id or '-'}\n"
                        )
                except Exception:
                    pass
                try:
                    tr = self.base_dir / "Backups" / "picker_trace.log"
                    tr.parent.mkdir(parents=True, exist_ok=True)
                    with tr.open("a", encoding="utf-8") as fh:
                        fh.write(
                            f"{datetime.now().isoformat()} BACKEND_PICK_RESULT trace={trace_id or '-'} "
                            f"mode={mode or 'any'} selected={len(files)}\n"
                        )
                except Exception:
                    pass
                response["ok"] = True
                response["data"] = {"files": [str(x) for x in files if str(x).strip()]}
                return response
            if cmd == "system.trace_log":
                trace_id = str(payload.get("traceId", "") or "").strip()
                stage = str(payload.get("stage", "") or "").strip()
                data = payload.get("data")
                try:
                    tr = self.base_dir / "Backups" / "picker_trace.log"
                    tr.parent.mkdir(parents=True, exist_ok=True)
                    with tr.open("a", encoding="utf-8") as fh:
                        fh.write(
                            f"{datetime.now().isoformat()} FRONTEND trace={trace_id or '-'} "
                            f"stage={stage or '-'} data={json.dumps(data, ensure_ascii=False)}\n"
                        )
                except Exception:
                    pass
                response["ok"] = True
                response["data"] = {"logged": True}
                return response
            if cmd == "system.get_last_picked_files":
                mode = str(payload.get("mode", "")).strip().lower()
                cached_mode = str(self._last_picker_mode or "").strip().lower()
                files: List[str] = []
                if self._last_picker_files:
                    files = [str(x) for x in self._last_picker_files if str(x).strip()]
                # If a specific mode is requested, only return matching cache.
                if mode and cached_mode and mode != cached_mode:
                    files = []
                try:
                    dbg = self.base_dir / "Backups" / "picker_debug.log"
                    dbg.parent.mkdir(parents=True, exist_ok=True)
                    with dbg.open("a", encoding="utf-8") as fh:
                        fh.write(
                            f"{datetime.now().isoformat()} system.get_last_picked_files mode={mode or 'any'} "
                            f"cached_mode={cached_mode or 'none'} selected={len(files)} age_ms="
                            f"{int(max(0.0, (time.time() - float(self._last_picker_ts or 0.0)) * 1000.0))}\n"
                        )
                except Exception:
                    pass
                response["ok"] = True
                response["data"] = {
                    "mode": cached_mode or "",
                    "files": files,
                    "age_ms": int(max(0.0, (time.time() - float(self._last_picker_ts or 0.0)) * 1000.0)),
                }
                return response
            if cmd == "toolkit.switch_to_native":
                # No-op: React is the only UI; keep user in web view
                response["ok"] = True
                response["data"] = {"switched": False}
                return response
            if cmd == "toolkit.switch_to_web":
                # No-op: React is always visible
                response["ok"] = True
                response["data"] = {"switched": False}
                return response
            if cmd == "system.get_state":
                print("system.get_state loginEmail:", str(self.config.get("login_email", "") or ""))
                response["ok"] = True
                response["data"] = self._build_bridge_status_payload()
                return response
            if cmd == "system.save_settings":
                mp3 = str(payload.get("mp3OutputPath", "")).strip()
                mp4 = str(payload.get("mp4OutputPath", "")).strip()
                quality = str(payload.get("defaultVideoQuality", "")).strip()
                tiktok_wm = payload.get("tiktokWatermark", None)
                login_email = str(payload.get("loginEmail", "")).strip()
                if mp3:
                    self.config["mp3_output_path"] = mp3
                if mp4:
                    self.config["mp4_output_path"] = mp4
                if quality:
                    self.config["default_video_quality"] = quality
                if isinstance(tiktok_wm, bool):
                    self.config["tiktok_watermark"] = tiktok_wm
                if "loginEmail" in payload:
                    self.config["login_email"] = login_email
                self._save_app_config()
                response["ok"] = True
                response["data"] = {
                    "saved": True,
                    "settings": {
                        "mp3OutputPath": str(self.config.get("mp3_output_path", "") or ""),
                        "mp4OutputPath": str(self.config.get("mp4_output_path", "") or ""),
                        "defaultVideoQuality": str(self.config.get("default_video_quality", "1080p") or "1080p"),
                        "tiktokWatermark": bool(self.config.get("tiktok_watermark", False)),
                        "loginEmail": str(self.config.get("login_email", "") or ""),
                    },
                }
                self._emit_web_status(immediate=True)
                return response
            if cmd == "system.read_text_file":
                raw_path = str(payload.get("path", "")).strip()
                if not raw_path:
                    raise ValueError("Missing required field: payload.path")
                target = Path(raw_path)
                if not target.exists() or not target.is_file():
                    raise FileNotFoundError(f"Text file not found: {target}")
                response["ok"] = True
                response["data"] = {"text": target.read_text(encoding="utf-8", errors="ignore")}
                return response
            if cmd == "system.set_ui_variant":
                variant = str(payload.get("variant", "")).strip().lower()
                enforced_variant = "new"
                if variant not in {"classic", "new"}:
                    raise ValueError("variant must be 'classic' or 'new'")
                self.config["ui_variant"] = enforced_variant
                self._save_app_config()
                response["ok"] = True
                response["data"] = {
                    "requestedVariant": variant,
                    "variant": enforced_variant,
                    "requiresRestart": True,
                }
                return response
            response["error"] = {"code": "E_UNKNOWN_COMMAND", "message": f"Unsupported command: {cmd}"}
            return response
        except Exception as exc:
            response["error"] = {"code": "E_COMMAND_FAILED", "message": str(exc)}
            return response

    def _emit_web_event(self, event_name: str, payload: Dict[str, object]) -> None:
        if QWebEngineView is None or not isinstance(self._toolkit_webview, QWebEngineView):
            return
        payload_js = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
        event_js = json.dumps(f"djtoolkit:{event_name}")
        script = (
            "window.dispatchEvent(new CustomEvent("
            + event_js
            + ", { detail: "
            + payload_js
            + " }));"
        )
        self._toolkit_webview.page().runJavaScript(script)

    def _build_bridge_status_payload(self) -> Dict[str, object]:
        running = bool(self.toolkit_proc and self.toolkit_proc.poll() is None)
        path_text = self.lbl_toolkit_path_full.text().strip()
        output_name = ""
        output_file = ""
        if self._toolkit_last_saved_path and self._toolkit_last_saved_path.exists():
            output_name = self._toolkit_last_saved_path.name
            output_file = str(self._toolkit_last_saved_path)
        source_url = ""
        try:
            urls = self._last_run_payload.get("urls", []) if isinstance(self._last_run_payload, dict) else []
            if isinstance(urls, list) and urls:
                source_url = str(urls[0]).strip()
        except Exception:
            source_url = ""
        progress = int(self.toolkit_progress.value())
        ui_state_text = self.lbl_toolkit_status.text().strip()
        ui_job_state = map_job_state_for_ui(ui_state_text, running, progress)
        eta_text = self.lbl_toolkit_eta.text().strip()
        speed_text = self.lbl_toolkit_speed.text().strip()
        result_text = self.lbl_toolkit_result.text().strip()
        urls = self._last_run_payload.get("urls", []) if isinstance(self._last_run_payload, dict) else []
        is_playlist = False
        try:
            if isinstance(urls, list):
                for u in urls:
                    t = str(u or "").lower()
                    if "list=" in t or "/playlist" in t:
                        is_playlist = True
                        break
        except Exception:
            is_playlist = False
        current_index = int(max(1, self._job_file_index))
        total_items = int(max(1, self._job_file_total))
        return {
            "version": BRIDGE_CONTRACT_VERSION,
            "event": "toolkit.status",
            "timestamp": bridge_iso_now(),
            "data": {
                "job": {
                    "id": self._last_run_option or "",
                    "name": self.lbl_toolkit_task.text().strip(),
                    "option": self._last_run_option or "",
                    "running": running,
                    "state": ui_job_state,
                    "stateLabel": ui_state_text,
                    "progress": progress,
                    "canCancel": running,
                    "currentIndex": current_index,
                    "totalItems": total_items,
                    "isPlaylist": is_playlist,
                },
                "metrics": {
                    "etaText": eta_text,
                    "speedText": speed_text,
                },
                "output": {
                    "folderPath": "" if path_text in {"", "-"} else path_text,
                    "fileName": output_name,
                    "filePath": output_file,
                    "sourceUrl": source_url,
                    "sourceTitle": self._toolkit_source_title,
                    "analysisResult": self._load_key_result_payload() if self._last_run_option == "15" else None,
                },
                "message": result_text,
                "settings": {
                    "mp3OutputPath": str(self.config.get("mp3_output_path", "") or ""),
                    "mp4OutputPath": str(self.config.get("mp4_output_path", "") or ""),
                    "defaultVideoQuality": str(self.config.get("default_video_quality", "1080p") or "1080p"),
                    "tiktokWatermark": bool(self.config.get("tiktok_watermark", False)),
                    "loginEmail": str(self.config.get("login_email", "") or ""),
                    "enableExtraFormats": bool(self.config.get("enable_extra_formats", False)),
                    "performanceMode": bool(self.config.get("performance_mode", False)),
                },
                "copyright": self._build_copyright_status_payload(),
            },
        }

    def _build_copyright_status_payload(self) -> Dict[str, object]:
        stats = self.db.stats()
        blocked = int(stats.get("blocked", 0))
        claimed = int(stats.get("claimed", 0))
        no_claim = int(stats.get("no_claim", 0))
        total_tested = int(stats.get("total", 0))
        cleared = claimed + no_claim
        compliance = int(round((cleared / total_tested) * 100)) if total_tested else 0
        scanning = bool(self.scan_worker and self.scan_worker.isRunning())
        scan_progress = int(self.progress.value()) if hasattr(self, "progress") else 0
        scan_label = self.lbl_progress.text().strip() if hasattr(self, "lbl_progress") else ""
        scan_hashing = self.lbl_hashing.text().strip() if hasattr(self, "lbl_hashing") else self._scan_hashing_name

        rows: List[Dict[str, str]] = []
        seen_names: set[str] = set()

        for item in self.new_file_items[:12]:
            name = item.path.name
            if name in seen_names:
                continue
            seen_names.add(name)
            rows.append({"name": name, "status": "Processing", "action": "PENDING"})

        if len(rows) < 12:
            limit = 12 - len(rows)
            for r in self.db.conn.execute(
                """
                SELECT file_name, result
                FROM files
                ORDER BY COALESCE(last_recheck_date, date_tested) DESC, id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall():
                name = str(r["file_name"] or "").strip()
                if not name or name in seen_names:
                    continue
                seen_names.add(name)
                result = str(r["result"] or "").strip()
                if result == "Blocked":
                    status = "Flagged"
                    action = "FIX"
                else:
                    status = "Cleared"
                    action = "DETAILS"
                rows.append({"name": name, "status": status, "action": action})
                if len(rows) >= 12:
                    break

        return {
            "scan": {
                "running": scanning,
                "progress": scan_progress,
                "label": scan_label,
                "hashing": scan_hashing,
            },
            "counts": {
                "filesInToTest": int(self._scan_total),
                "alreadyTested": int(self._scan_skipped),
                "newFiles": int(len(self.new_file_items)),
                "totalTracks": int(self._scan_total) if self._scan_total else int(total_tested),
                "totalTested": total_tested,
                "cleared": cleared,
                "flagged": blocked,
                "complianceScore": compliance,
            },
            "rows": rows,
        }

    def _emit_web_status(self, immediate: bool = False) -> None:
        payload = self._build_bridge_status_payload()
        if immediate:
            self._emit_web_event("v1:event", payload)
            return
        self._pending_web_status = payload
        if not self._web_status_timer.isActive():
            self._web_status_timer.start()

    def _flush_web_status(self) -> None:
        if not self._pending_web_status:
            return
        payload = self._pending_web_status
        self._pending_web_status = None
        self._emit_web_event("v1:event", payload)

    def on_theme_changed(self, value: str) -> None:
        self._current_theme = value.strip().lower()
        self.setStyleSheet(self._theme_stylesheet(self._current_theme))
        if hasattr(self, "cmb_theme") and self.cmb_theme.currentText() != value:
            self.cmb_theme.setCurrentText(value)
        if hasattr(self, "cmb_theme_settings") and self.cmb_theme_settings.currentText() != value:
            self.cmb_theme_settings.setCurrentText(value)
        self.lbl_status.setText(f"Theme: {value}")

    def on_density_changed(self, value: str) -> None:
        self._current_density = value.strip().lower()
        compact = self._current_density == "compact"
        self.btn_nav_toolkit.setMinimumHeight(34 if compact else 40)
        self.btn_nav_copyright.setMinimumHeight(34 if compact else 40)
        self.btn_nav_key.setMinimumHeight(34 if compact else 40)
        self.btn_nav_settings.setMinimumHeight(34 if compact else 40)
        if hasattr(self, "cmb_density") and self.cmb_density.currentText() != value:
            self.cmb_density.setCurrentText(value)
        if hasattr(self, "cmb_density_settings") and self.cmb_density_settings.currentText() != value:
            self.cmb_density_settings.setCurrentText(value)
        self.lbl_status.setText(f"Density: {value}")

    def _palette_actions(self) -> List[Dict[str, str]]:
        actions = [
            {"id": "nav_toolkit", "label": "Open MyDJToolkit"},
            {"id": "nav_copyright", "label": "Open Copyright"},
            {"id": "nav_key", "label": "Open Key Detection"},
            {"id": "nav_settings", "label": "Open Settings"},
            {"id": "scan", "label": "Scan Folder / Files"},
            {"id": "show_old", "label": "Show Old Files"},
            {"id": "stop", "label": "Stop Active Toolkit Job"},
        ]
        for spec in self._tool_button_specs:
            actions.append({"id": f"tool_{spec['option']}", "label": f"Run: {spec['text']}"})
        return actions

    def open_command_palette(self) -> None:
        dlg = CommandPaletteDialog(self, self._palette_actions())
        if dlg.exec() != QtWidgets.QDialog.Accepted or not dlg.selected_action:
            return
        aid = dlg.selected_action["id"]
        if aid == "nav_toolkit":
            self.show_toolkit_page()
        elif aid == "nav_copyright":
            self.show_copyright_page()
        elif aid == "nav_key":
            self.show_key_page()
        elif aid == "nav_settings":
            self.show_settings_page()
        elif aid == "scan":
            self.scan_folder()
        elif aid == "show_old":
            self.show_old_files_dialog()
        elif aid == "stop":
            self.stop_toolkit_process()
        elif aid.startswith("tool_"):
            self.run_toolkit_option(aid.replace("tool_", ""))

    def keyPressEvent(self, event: QtGui.QKeyEvent) -> None:
        if event.modifiers() & QtCore.Qt.ControlModifier and event.key() == QtCore.Qt.Key_K:
            self.open_command_palette()
            event.accept()
            return
        super().keyPressEvent(event)

    def choose_scan_items(self) -> List[Path]:
        files, _ = QtWidgets.QFileDialog.getOpenFileNames(
            self, "Select MP3/MP4/AAC files", str(self.folders["to_test"]), "Media Files (*.mp3 *.mp4 *.aac)"
        )
        return [Path(f) for f in files]

    def scan_folder(self) -> None:
        if self.scan_worker and self.scan_worker.isRunning():
            self.lbl_status.setText("Scan already running.")
            return
        files = [p for p in self.choose_scan_items() if p.suffix.lower() in ALLOWED_EXTENSIONS]
        if not files:
            self.lbl_status.setText("Scan cancelled or no valid files.")
            return
        self.btn_scan.setEnabled(False)
        self._scan_total = len(files)
        self._scan_skipped = 0
        self._scan_hashing_name = "-"
        self.progress.setValue(0)
        self.lbl_progress.setText(f"Scanning: 0 / {len(files)} files")
        self.lbl_hashing.setText("Currently hashing: -")
        self.lbl_status.setText("Background scan started...")
        self._emit_web_status(immediate=True)
        self.scan_worker = ScanWorker(files, self.db.db_path, self.folders["tested"], True)
        self.scan_worker.progress.connect(self.on_scan_progress)
        self.scan_worker.done.connect(self.on_scan_done)
        self.scan_worker.failed.connect(self.on_scan_error)
        self.scan_worker.start()

    def on_scan_progress(self, i: int, total: int, name: str) -> None:
        pct = int((i / total) * 100) if total else 0
        self._scan_total = total
        self._scan_hashing_name = name
        self.progress.setValue(pct)
        self.lbl_progress.setText(f"Scanning: {i} / {total} files")
        self.lbl_hashing.setText(f"Currently hashing: {name}")
        self._emit_web_status()

    def on_scan_done(self, total: int, skipped: int, new_items: List[FileItem], duplicates: List[Dict[str, object]]) -> None:
        self.btn_scan.setEnabled(True)
        self._scan_total = total
        self._scan_skipped = skipped
        self._scan_hashing_name = "-"
        self.new_file_items = new_items
        self.duplicate_records = duplicates
        self.lbl_total.setText(f"Files in /To_Test: {total}")
        self.lbl_skipped.setText(f"Already Tested: {skipped}")
        self.lbl_new.setText(f"New Files Found: {len(new_items)}")
        self.lbl_status.setText("Scan complete.")
        self.page = 0
        self.refresh_new_list()
        self._emit_web_status(immediate=True)
        if duplicates:
            QtWidgets.QMessageBox.information(self, "Duplicates", f"Detected {len(duplicates)} duplicate file(s).")

    def on_scan_error(self, err: str) -> None:
        self.btn_scan.setEnabled(True)
        self.lbl_status.setText(f"Scan failed: {err}")
        self._emit_web_status(immediate=True)

    def set_filter(self, f: str) -> None:
        if self.current_filter == f:
            return
        self.current_filter = f
        self.page = 0
        self.refresh_new_list()

    def filtered_new_items(self) -> List[FileItem]:
        return self.new_file_items

    def refresh_new_list(self) -> None:
        items = self.filtered_new_items()
        total_pages = max(1, (len(items) + self.page_size - 1) // self.page_size)
        self.page = max(0, min(self.page, total_pages - 1))
        self.lbl_page.setText(f"Page {self.page + 1} / {total_pages}")
        self.list_files.setUpdatesEnabled(False)
        self.list_files.clear()
        if not items:
            self.list_files.addItem("No new files found.")
            self.selected_item = None
            self.lbl_selected.setText("Selected: None")
            self.list_files.setUpdatesEnabled(True)
            return
        start = self.page * self.page_size
        page_items = items[start : start + self.page_size]
        for idx, item in enumerate(page_items, start=start + 1):
            lw = QtWidgets.QListWidgetItem(f"{idx}. {item.path.name}")
            lw.setData(QtCore.Qt.UserRole, item.path.as_posix())
            self.list_files.addItem(lw)
        self.list_files.setCurrentRow(0)
        self.list_files.setUpdatesEnabled(True)
        self.on_select_item()

    def on_select_item(self) -> None:
        selected = self.list_files.selectedItems()
        if not selected:
            self.selected_item = None
            self.lbl_selected.setText("Selected: None")
            self.lbl_selected.setToolTip("")
            return
        keys = [it.data(QtCore.Qt.UserRole) for it in selected if it.data(QtCore.Qt.UserRole)]
        found_items = [x for x in self.new_file_items if x.path.as_posix() in set(keys)]
        self.selected_item = found_items[0] if found_items else None
        if len(found_items) > 1:
            label = f"Selected: {len(found_items)} files"
            self.lbl_selected.setText(label)
            self.lbl_selected.setToolTip(label)
            return
        if found_items:
            full = found_items[0].path.name
            metrics = self.lbl_selected.fontMetrics()
            elided = metrics.elidedText(full, QtCore.Qt.ElideRight, 380)
            self.lbl_selected.setText(f"Selected: {elided}")
            self.lbl_selected.setToolTip(full)
        else:
            self.lbl_selected.setText("Selected: None")
            self.lbl_selected.setToolTip("")

    def selected_file_items(self) -> List[FileItem]:
        selected = self.list_files.selectedItems()
        if not selected:
            return []
        keys = [it.data(QtCore.Qt.UserRole) for it in selected if it.data(QtCore.Qt.UserRole)]
        keyset = set(keys)
        return [x for x in self.new_file_items if x.path.as_posix() in keyset]

    def show_file_context_menu(self, pos: QtCore.QPoint) -> None:
        item = self.list_files.itemAt(pos)
        if item is None or not item.data(QtCore.Qt.UserRole):
            return
        if not item.isSelected():
            self.list_files.clearSelection()
            item.setSelected(True)
            self.on_select_item()
        menu = QtWidgets.QMenu(self)
        a_block = menu.addAction("Mark Blocked")
        a_claim = menu.addAction("Mark Claimed")
        a_clean = menu.addAction("Mark No Claim")
        menu.addSeparator()
        a_open_loc = menu.addAction("Open File Location")
        a_preview = menu.addAction("Preview")
        chosen = menu.exec(self.list_files.mapToGlobal(pos))
        if chosen is a_block:
            self.mark_selected(RESULT_BLOCKED)
        elif chosen is a_claim:
            self.mark_selected(RESULT_CLAIMED)
        elif chosen is a_clean:
            self.mark_selected(RESULT_NO_CLAIM)
        elif chosen is a_open_loc:
            self.open_selected_file_location()
        elif chosen is a_preview:
            self.preview_selected_file()

    def open_selected_file_location(self) -> None:
        files = self.selected_file_items()
        if not files:
            self.lbl_status.setText("Select a file first.")
            return
        target = files[0].path
        folder = target.parent if target.exists() else self.folders["to_test"]
        QtGui.QDesktopServices.openUrl(QtCore.QUrl.fromLocalFile(str(folder)))

    def preview_selected_file(self) -> None:
        files = self.selected_file_items()
        if not files:
            self.lbl_status.setText("Select a file first.")
            return
        target = files[0].path
        if not target.exists():
            self.lbl_status.setText("File not found.")
            return
        QtGui.QDesktopServices.openUrl(QtCore.QUrl.fromLocalFile(str(target)))

    def prev_page(self) -> None:
        if self.page > 0:
            self.page -= 1
            self.refresh_new_list()

    def next_page(self) -> None:
        items = self.filtered_new_items()
        total_pages = max(1, (len(items) + self.page_size - 1) // self.page_size)
        if self.page + 1 < total_pages:
            self.page += 1
            self.refresh_new_list()

    def select_all_files(self) -> None:
        if self.list_files.count() == 0:
            return
        self.list_files.blockSignals(True)
        for i in range(self.list_files.count()):
            item = self.list_files.item(i)
            if item is None:
                continue
            if item.data(QtCore.Qt.UserRole):
                item.setSelected(True)
        self.list_files.blockSignals(False)
        self.on_select_item()

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

    def mark_selected(self, result: str) -> None:
        targets = self.selected_file_items()
        if not targets and self.selected_item:
            targets = [self.selected_item]
        if not targets:
            self.lbl_status.setText("Select a file first.")
            return

        block_type = None
        if result == RESULT_BLOCKED:
            if QtWidgets.QMessageBox.question(self, "Confirm", "Mark selected file(s) as BLOCKED?") != QtWidgets.QMessageBox.Yes:
                return
            block_type, ok = QtWidgets.QInputDialog.getItem(self, "Block Type", "Choose block type", BLOCK_TYPES, 0, False)
            if not ok:
                return

        dest = self.folders["blocked"] if result == RESULT_BLOCKED else self.folders["claimed"] if result == RESULT_CLAIMED else self.folders["no_claim"]
        moved_count = 0
        for item in list(targets):
            if not item.path.exists():
                self.new_file_items = [x for x in self.new_file_items if x.path != item.path]
                continue
            moved = self._safe_move(item.path, dest)
            self.db.upsert_file(
                file_hash=item.file_hash,
                file_name=moved.name,
                result=result,
                current_path=moved,
                is_recheck=False,
                block_type=block_type,
            )
            moved_count += 1
            self.new_file_items = [x for x in self.new_file_items if x.path != item.path]
        self.lbl_new.setText(f"New Files Found: {len(self.new_file_items)}")
        self.refresh_new_list()
        self.refresh_stats()
        self.lbl_status.setText(f"{moved_count} file(s) saved as {result}.")
        self._emit_web_status(immediate=True)

    def run_toolkit_option(self, option: str, forced_tiktok_mode: Optional[str] = None) -> None:
        if self.toolkit_proc and self.toolkit_proc.poll() is None:
            self.lbl_status.setText("Toolkit task already running.")
            return
        self._forced_tiktok_mode = forced_tiktok_mode

        script_path = self.base_dir / "DJ_TOOLKIT_V2_PACK" / "DJ_TOOLKIT_V2.ps1"
        if not script_path.exists():
            self.lbl_status.setText("DJ_TOOLKIT_V2.ps1 not found.")
            return
        title_map, fn_map = self._toolkit_option_maps()
        fn = fn_map.get(option)
        if not fn:
            return
        payload = self._collect_toolkit_inputs(option)
        if payload is None:
            self.lbl_status.setText("Toolkit action cancelled.")
            return
        self._launch_toolkit_option(option, payload, title_map, fn_map, script_path)

    def run_toolkit_option_direct(self, option: str, payload: Optional[Dict[str, object]] = None) -> None:
        if self.toolkit_proc and self.toolkit_proc.poll() is None:
            self.lbl_status.setText("Toolkit task already running.")
            return
        script_path = self.base_dir / "DJ_TOOLKIT_V2_PACK" / "DJ_TOOLKIT_V2.ps1"
        if not script_path.exists():
            self.lbl_status.setText("DJ_TOOLKIT_V2.ps1 not found.")
            return
        title_map, fn_map = self._toolkit_option_maps()
        if option not in fn_map:
            self.lbl_status.setText(f"Unsupported toolkit option: {option}")
            return
        merged_payload: Dict[str, object] = {"option": option}
        if payload:
            merged_payload.update(payload)
        if option in {"1", "2", "3", "4", "5"} and not merged_payload.get("urls"):
            self.lbl_status.setText("Missing URL input for toolkit action.")
            return
        self._launch_toolkit_option(option, merged_payload, title_map, fn_map, script_path)

    def _toolkit_option_maps(self) -> tuple[Dict[str, str], Dict[str, str]]:
        title_map = {
            "1": "Downloading YouTube Video",
            "2": "Downloading Backup MP4",
            "3": "Downloading with Cookies",
            "4": "Processing TikTok Job",
            "5": "Converting YouTube to MP3",
            "6": "Wrapping Audio + Image to MP4",
            "7": "Converting Local Video to MP3",
            "16": "Generating MP4 Batch",
            "17": "Concatenating MP4 Files",
            "13": "Separating Audio Stems",
            "14": "Analyzing BPM",
            "15": "Analyzing Musical Key",
        }
        fn_map = {
            "1": "Download-yDLQ",
            "2": "Download-yDL",
            "3": "Download-yDLCookies",
            "4": "Download-yDLTikTok",
            "5": "Download-yDLAMp3",
            "6": "Wrap-AudioToMp4",
            "7": "Convert-VideoFilesToMp3",
            "16": "Generate-Mp4Batch",
            "17": "Concat-Mp4Batch",
            "13": "Producer-Demucs",
            "14": "Producer-Bpm",
            "15": "Producer-KeyDetect",
        }
        return title_map, fn_map

    @staticmethod
    def _fmt_eta(seconds: Optional[float]) -> str:
        if seconds is None:
            return "--:--"
        sec = max(0, int(seconds))
        mm, ss = divmod(sec, 60)
        hh, mm = divmod(mm, 60)
        if hh > 0:
            return f"{hh:02d}:{mm:02d}:{ss:02d}"
        return f"{mm:02d}:{ss:02d}"

    @staticmethod
    def _extract_youtube_video_id(url: str) -> str:
        try:
            parsed = urlparse(url.strip())
            host = (parsed.netloc or "").lower()
            path = (parsed.path or "").strip("/")
            if "youtu.be" in host and path:
                return path.split("/")[0]
            if "youtube.com" in host:
                if path == "watch":
                    v = parse_qs(parsed.query).get("v", [""])[0].strip()
                    if v:
                        return v
                if path.startswith("shorts/"):
                    return path.split("/", 1)[1].split("/")[0].strip()
                if path.startswith("live/"):
                    return path.split("/", 1)[1].split("/")[0].strip()
        except Exception:
            return ""
        return ""

    @staticmethod
    def _fmt_speed(speed_bps: Optional[float]) -> str:
        if not speed_bps or speed_bps <= 0:
            return "-- MB/s"
        return f"{speed_bps / (1024 * 1024):.2f} MB/s"

    def _preferred_output_dir_for_option(self, option: str) -> Path:
        mp3_cfg = str(self.config.get("mp3_output_path", "")).strip()
        mp4_cfg = str(self.config.get("mp4_output_path", "")).strip()
        if option in {"5", "7"} and mp3_cfg:
            out = Path(mp3_cfg)
        elif option not in {"5", "7"} and mp4_cfg:
            out = Path(mp4_cfg)
        else:
            downloads = Path.home() / "Downloads" / "DJDownloads"
            out = downloads / ("MP3" if option in {"5", "7"} else "MP4")
        out.mkdir(parents=True, exist_ok=True)
        return out

    def _video_format_for_quality(self, quality: str, strict_avc: bool = True) -> str:
        q = (quality or "1080p").strip().lower()
        if q == "720p":
            cap = 720
            exact = 720
        elif q in {"1440p", "2k"}:
            cap = 1440
            exact = 1440
        elif q in {"4k", "2160p"}:
            cap = 2160
            exact = 2160
        else:
            cap = 1080
            exact = 1080
        allow_modern_video = cap > 1080
        vcodec_part = "[vcodec^=avc1]" if strict_avc and not allow_modern_video else ""
        if allow_modern_video:
            exact_chain = f"bestvideo[height={exact}]+bestaudio/bestvideo[height={exact}]"
            capped_chain = f"bestvideo[height<={cap}]+bestaudio/bestvideo[height<={cap}]"
            generic_chain = f"best[height<={cap}]"
            direct_mp4 = f"best[ext=mp4][height<={cap}]"
            return f"{exact_chain}/{capped_chain}/{generic_chain}/{direct_mp4}/best"
        exact_chain = f"bestvideo[ext=mp4]{vcodec_part}[height={exact}]+bestaudio[ext=m4a][acodec^=mp4a]"
        capped_chain = f"bestvideo[ext=mp4]{vcodec_part}[height<={cap}]+bestaudio[ext=m4a][acodec^=mp4a]"
        generic_chain = f"bestvideo[ext=mp4][height<={cap}]+bestaudio[ext=m4a]"
        direct_mp4 = f"best[ext=mp4][height<={cap}]"
        return f"{exact_chain}/{capped_chain}/{generic_chain}/{direct_mp4}/best[ext=mp4]"

    def _run_native_queue_job(
        self,
        *,
        option: str,
        payload: Dict[str, object],
        task_name: str,
        runner: Callable[[threading.Event], Dict[str, object]],
    ) -> bool:
        self._job_file_total = len(payload.get("urls", [])) + len(payload.get("files", [])) + len(payload.get("one_files", []))
        if self._job_file_total <= 0:
            self._job_file_total = 1
        self._job_file_index = 1
        self._last_run_option = option
        self._last_run_payload = deepcopy(payload)
        self._reset_toolkit_panel(task_name)
        self._set_toolkit_running_ui(True)
        self._active_toolkit_mode = "native"
        self._native_cancel_event.clear()

        handle = NativeToolkitProcessHandle(self._native_cancel_event.set)
        self.toolkit_proc = handle

        def worker() -> None:
            stats = {"success": 0, "failed": 0, "skipped": 0, "message": ""}
            code = 0
            try:
                stats = runner(self._native_cancel_event)
                if self._native_cancel_event.is_set():
                    code = 1
                    if not stats.get("message"):
                        stats["message"] = "Task stopped by user."
                elif int(stats.get("failed", 0)) > 0 and int(stats.get("success", 0)) == 0:
                    code = 1
            except Exception as exc:
                code = 1
                stats = {"success": 0, "failed": 1, "skipped": 0, "message": str(exc)}
                self.toolkit_queue.put(f"error: {exc}")
            finally:
                if stats.get("message"):
                    msg = str(stats["message"]).strip()
                    if msg:
                        self.toolkit_queue.put(msg if msg.lower().startswith("error:") else f"error: {msg}" if code else msg)
                self.toolkit_queue.put(
                    f"Queue done. success={int(stats.get('success', 0))}, failed={int(stats.get('failed', 0))}, skipped={int(stats.get('skipped', 0))}"
                )
                handle.set_returncode(code)
                self.toolkit_queue.put(f"[toolkit finished] exit code: {code}")

        threading.Thread(target=worker, daemon=True).start()
        QtCore.QTimer.singleShot(100, self._poll_toolkit_queue)
        self.lbl_status.setText("Native toolkit job started.")
        self._emit_web_status(immediate=True)
        return True

    def _start_native_tiktok_option(self, option: str, payload: Dict[str, object], task_name: str) -> bool:
        try:
            import yt_dlp  # type: ignore[import-not-found]
        except Exception:
            return False
        mode = str(payload.get("mode", "1")).strip()
        prefer_watermark = bool(payload.get("tiktok_watermark", self.config.get("tiktok_watermark", False)))
        if mode == "2":
            # Sound-batch mode still uses script fallback logic for now.
            return False
        urls = [str(x).strip() for x in payload.get("urls", []) if str(x).strip()]
        if not urls:
            self.lbl_status.setText("Missing URL input for toolkit action.")
            return True
        output_path = str(payload.get("output_path", "")).strip()
        if not output_path:
            self._reset_toolkit_panel(task_name)
            self._set_toolkit_running_ui(False)
            self._set_toolkit_state("Error")
            self.lbl_toolkit_result.setText("Output folder is not set. Open Settings and choose an output folder.")
            self.lbl_status.setText("TikTok job blocked: no output folder selected.")
            self._emit_web_status(immediate=True)
            return True
        out_dir = Path(output_path)
        try:
            out_dir.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            self._reset_toolkit_panel(task_name)
            self._set_toolkit_running_ui(False)
            self._set_toolkit_state("Error")
            self.lbl_toolkit_result.setText(f"Cannot use output folder: {out_dir}")
            self.lbl_status.setText(f"TikTok job blocked: {exc}")
            self._emit_web_status(immediate=True)
            return True
        self.btn_path_link.setText(self._pretty_path(out_dir))
        self.lbl_toolkit_path_full.setText(str(out_dir))

        def runner(cancel_event: threading.Event) -> Dict[str, object]:
            success = 0
            failed = 0
            for idx, url in enumerate(urls, start=1):
                if cancel_event.is_set():
                    break
                self.toolkit_queue.put(f"{idx}/{len(urls)}")

                class _Logger:
                    def debug(self, msg: str) -> None:
                        if msg:
                            self_q.put(str(msg))
                    def warning(self, msg: str) -> None:
                        if msg:
                            self_q.put(f"warning: {msg}")
                    def error(self, msg: str) -> None:
                        if msg:
                            self_q.put(f"error: {msg}")

                self_q = self.toolkit_queue
                last_emit = {"t": 0.0}

                def hook(data: Dict[str, object]) -> None:
                    if cancel_event.is_set():
                        raise Exception("Canceled by user")
                    info_dict = data.get("info_dict")
                    if isinstance(info_dict, dict):
                        hook_title = str(info_dict.get("title", "")).strip()
                        if hook_title:
                            self_q.put(f"title: {hook_title}")
                    if str(data.get("status", "")).lower() == "downloading":
                        now = time.monotonic()
                        if now - last_emit["t"] < 0.12:
                            return
                        last_emit["t"] = now
                        total = data.get("total_bytes") or data.get("total_bytes_estimate")
                        done = data.get("downloaded_bytes")
                        pct = 0
                        try:
                            if total and done:
                                pct = int((float(done) / max(1.0, float(total))) * 100)
                        except Exception:
                            pct = 0
                        pct = max(0, min(100, pct))
                        self_q.put(f"[{pct}%] speed: {self._fmt_speed(float(data.get('speed', 0) or 0))} eta {self._fmt_eta(float(data.get('eta', 0) or 0))}")
                    elif str(data.get("status", "")).lower() == "finished":
                        fn = str(data.get("filename", "")).strip()
                        if fn:
                            self_q.put(f"done: {fn}")

                ydl_opts: Dict[str, object] = {
                    "noplaylist": True,
                    "quiet": True,
                    "no_warnings": True,
                    "logger": _Logger(),
                    "progress_hooks": [hook],
                    "windowsfilenames": True,
                    "outtmpl": str(out_dir / "%(title).180s.%(ext)s"),
                    "format": "bestaudio/best" if mode == "3" else (
                        "download_addr/download/bv*+ba/best" if prefer_watermark else "play_addr_h264/play_addr/bv*+ba/best"
                    ),
                }
                if mode == "3":
                    ydl_opts["postprocessors"] = [
                        {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "0"}
                    ]
                if shutil.which("aria2c"):
                    ydl_opts["external_downloader"] = "aria2c"
                    ydl_opts["external_downloader_args"] = ["-x16", "-s16", "-k1M", "--summary-interval=1"]
                try:
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([url])
                    success += 1
                except Exception as exc:
                    failed += 1
                    self_q.put(f"error: {exc}")
            return {"success": success, "failed": failed, "skipped": 0}

        return self._run_native_queue_job(option=option, payload=payload, task_name=task_name, runner=runner)

    def _start_native_ffmpeg_jobs(self, option: str, payload: Dict[str, object], task_name: str) -> bool:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            return False

        def parse_duration(value: str) -> int:
            text = (value or "").strip().lower()
            if text.endswith("s"):
                text = text[:-1]
            if text == "full":
                return 0
            try:
                sec = int(float(text))
            except Exception:
                return 0
            return max(0, sec)

        def run_cmd(cmd: List[str], cancel_event: threading.Event) -> int:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            assert proc.stdout is not None
            for line in proc.stdout:
                if cancel_event.is_set():
                    try:
                        proc.terminate()
                    except Exception:
                        pass
                    break
                if line:
                    self.toolkit_queue.put(line.strip())
            return int(proc.wait())

        if option == "16":
            files = [Path(str(x)) for x in payload.get("files", []) if str(x).strip()]
            files = [p for p in files if p.exists() and p.is_file()]
            if not files:
                picked, _ = QtWidgets.QFileDialog.getOpenFileNames(
                    self,
                    "Select audio files for MP4 batch",
                    str(self.base_dir),
                    "Audio files (*.mp3 *.wav *.m4a *.aac *.flac *.ogg);;All files (*.*)",
                )
                files = [Path(x) for x in picked if x]
            if not files:
                self.lbl_status.setText("No audio files selected.")
                return True
            explicit_out = str(payload.get("outputPath", "") or "").strip()
            if explicit_out:
                out_dir = Path(explicit_out)
                out_dir.mkdir(parents=True, exist_ok=True)
            else:
                out_dir = files[0].parent if files else self._preferred_output_dir_for_option("16")
            self.btn_path_link.setText(self._pretty_path(out_dir))
            self.lbl_toolkit_path_full.setText(str(out_dir))
            offset_sec = parse_duration(str(payload.get("offset", "30s")))
            blank_visual = self.base_dir / "Blank_visual" / "black.jpg"
            temp_dir = self.base_dir / "Backups" / "internal" / f"mp4gen_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
            temp_dir.mkdir(parents=True, exist_ok=True)

            def runner(cancel_event: threading.Event) -> Dict[str, object]:
                success = 0
                failed = 0
                normalized_audio: List[Path] = []
                for idx, src in enumerate(files, start=1):
                    if cancel_event.is_set():
                        break
                    self.toolkit_queue.put(f"{idx}/{len(files)}")
                    pct = int(((idx - 1) / max(1, len(files))) * 65)
                    self.toolkit_queue.put(f"[{pct}%] Preparing audio {src.name}")
                    part_audio = temp_dir / f"part_{idx:03d}.m4a"
                    cmd = [ffmpeg, "-y"]
                    if offset_sec > 0:
                        cmd.extend(["-t", str(offset_sec)])
                    cmd.extend(
                        [
                            "-i",
                            str(src),
                            "-vn",
                            "-c:a",
                            "aac",
                            "-b:a",
                            "192k",
                            str(part_audio),
                        ]
                    )
                    rc = run_cmd(cmd, cancel_event)
                    if rc == 0 and part_audio.exists():
                        normalized_audio.append(part_audio)
                    else:
                        failed += 1
                        self.toolkit_queue.put(f"error: audio prep failed {src.name}")

                if cancel_event.is_set():
                    return {"success": 0, "failed": max(1, failed), "skipped": 0, "message": "Task stopped by user."}
                if not normalized_audio:
                    return {"success": 0, "failed": max(1, failed), "skipped": 0, "message": "No valid audio files to process."}

                list_file = temp_dir / "concat_audio.txt"
                list_file.write_text("\n".join([f"file '{p.as_posix()}'" for p in normalized_audio]), encoding="utf-8")
                merged_audio = temp_dir / "merged_audio.m4a"
                self.toolkit_queue.put("[75%] Merging selected audio files")
                rc = run_cmd([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(list_file), "-c", "copy", str(merged_audio)], cancel_event)
                if (rc != 0 or not merged_audio.exists()) and not cancel_event.is_set():
                    rc = run_cmd([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(list_file), "-c:a", "aac", "-b:a", "192k", str(merged_audio)], cancel_event)
                if (rc != 0 or not merged_audio.exists()) and not cancel_event.is_set():
                    # Fallback for mixed/edge audio files where concat demuxer can fail.
                    cmd_concat = [ffmpeg, "-y"]
                    for p in normalized_audio:
                        cmd_concat.extend(["-i", str(p)])
                    filter_graph = "".join([f"[{i}:a]" for i in range(len(normalized_audio))]) + f"concat=n={len(normalized_audio)}:v=0:a=1[aout]"
                    cmd_concat.extend(["-filter_complex", filter_graph, "-map", "[aout]", "-c:a", "aac", "-b:a", "192k", str(merged_audio)])
                    rc = run_cmd(cmd_concat, cancel_event)
                if cancel_event.is_set():
                    return {"success": 0, "failed": max(1, failed), "skipped": 0, "message": "Task stopped by user."}
                if rc != 0 or not merged_audio.exists():
                    return {"success": 0, "failed": max(1, failed + 1), "skipped": 0, "message": "Failed to merge selected audio files."}

                out_file = out_dir / f"copyright_batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
                self.toolkit_queue.put("[90%] Creating final MP4 output")
                if blank_visual.exists():
                    cmd_video = [
                        ffmpeg, "-y",
                        "-loop", "1", "-i", str(blank_visual),
                        "-i", str(merged_audio),
                        "-shortest",
                        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
                        "-c:v", "libx264",
                        "-tune", "stillimage",
                        "-c:a", "aac", "-b:a", "192k",
                        "-movflags", "+faststart",
                        str(out_file),
                    ]
                else:
                    cmd_video = [
                        ffmpeg, "-y",
                        "-f", "lavfi", "-i", "color=c=black:s=1920x1080:r=30",
                        "-i", str(merged_audio),
                        "-shortest",
                        "-c:v", "libx264",
                        "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-b:a", "192k",
                        "-movflags", "+faststart",
                        str(out_file),
                    ]
                rc = run_cmd(cmd_video, cancel_event)
                if rc == 0 and out_file.exists():
                    success = 1
                    self.toolkit_queue.put("done: " + str(out_file))
                    return {"success": success, "failed": failed, "skipped": 0}
                return {"success": 0, "failed": max(1, failed + 1), "skipped": 0, "message": "MP4 generation failed."}

            return self._run_native_queue_job(option=option, payload=payload, task_name=task_name, runner=runner)

        if option == "17":
            files = [Path(str(x)) for x in payload.get("files", []) if str(x).strip()]
            files = [p for p in files if p.exists() and p.is_file()]
            if not files:
                picked, _ = QtWidgets.QFileDialog.getOpenFileNames(
                    self,
                    "Select MP4 files to concatenate",
                    str(self.base_dir),
                    "Video files (*.mp4 *.mov *.mkv *.webm);;All files (*.*)",
                )
                files = [Path(x) for x in picked if x]
            if not files:
                self.lbl_status.setText("No video files selected.")
                return True
            out_dir = self._preferred_output_dir_for_option("17")
            self.btn_path_link.setText(self._pretty_path(out_dir))
            self.lbl_toolkit_path_full.setText(str(out_dir))
            segment_sec = parse_duration(str(payload.get("segmentDuration", "30s")))
            temp_dir = self.base_dir / "Backups" / "internal" / f"concat_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
            temp_dir.mkdir(parents=True, exist_ok=True)

            def runner(cancel_event: threading.Event) -> Dict[str, object]:
                success = 0
                failed = 0
                normalized: List[Path] = []
                for idx, src in enumerate(files, start=1):
                    if cancel_event.is_set():
                        break
                    self.toolkit_queue.put(f"{idx}/{len(files)}")
                    pct = int(((idx - 1) / max(1, len(files))) * 70)
                    self.toolkit_queue.put(f"[{pct}%] Preparing segment {src.name}")
                    norm = temp_dir / f"seg_{idx:03d}.mp4"
                    cmd = [ffmpeg, "-y", "-i", str(src)]
                    if segment_sec > 0:
                        cmd.extend(["-t", str(segment_sec)])
                    cmd.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-movflags", "+faststart", str(norm)])
                    rc = run_cmd(cmd, cancel_event)
                    if rc == 0 and norm.exists():
                        normalized.append(norm)
                    else:
                        failed += 1
                        self.toolkit_queue.put(f"error: segment prep failed {src.name}")
                if cancel_event.is_set():
                    return {"success": success, "failed": max(1, failed), "skipped": 0, "message": "Task stopped by user."}
                if not normalized:
                    return {"success": 0, "failed": max(1, failed), "skipped": 0, "message": "No valid segments to concatenate."}
                list_file = temp_dir / "concat_list.txt"
                list_file.write_text("\n".join([f"file '{p.as_posix()}'" for p in normalized]), encoding="utf-8")
                out_file = out_dir / f"concat_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
                self.toolkit_queue.put("[85%] Concatenating final output")
                rc = run_cmd([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(list_file), "-c", "copy", str(out_file)], cancel_event)
                if rc == 0 and out_file.exists():
                    success += 1
                    self.toolkit_queue.put("done: " + str(out_file))
                else:
                    failed += 1
                    self.toolkit_queue.put("error: concatenate failed")
                return {"success": success, "failed": failed, "skipped": 0}

            return self._run_native_queue_job(option=option, payload=payload, task_name=task_name, runner=runner)

        if option == "6":
            one_files = payload.get("one_files", [])
            if not isinstance(one_files, list) or len(one_files) < 2:
                self.lbl_status.setText("Missing audio/image inputs.")
                return True
            audio = Path(str(one_files[0]))
            image = Path(str(one_files[1]))
            out_dir = self._preferred_output_dir_for_option("4")
            out_file = out_dir / f"{audio.stem}_cover.mp4"
            self.btn_path_link.setText(self._pretty_path(out_dir))
            self.lbl_toolkit_path_full.setText(str(out_dir))

            def runner(cancel_event: threading.Event) -> Dict[str, object]:
                cmd = [
                    ffmpeg, "-y", "-loop", "1", "-i", str(image), "-i", str(audio),
                    "-c:v", "libx264", "-tune", "stillimage", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", "-pix_fmt", "yuv420p", str(out_file)
                ]
                rc = run_cmd(cmd, cancel_event)
                if rc == 0 and out_file.exists():
                    self.toolkit_queue.put("done: " + str(out_file))
                    return {"success": 1, "failed": 0, "skipped": 0}
                return {"success": 0, "failed": 1, "skipped": 0, "message": "FFmpeg wrap failed."}

            return self._run_native_queue_job(option=option, payload=payload, task_name=task_name, runner=runner)

        if option == "7":
            files = [Path(str(x)) for x in payload.get("files", [])]
            if not files:
                self.lbl_status.setText("No local files selected.")
                return True
            out_dir = self._preferred_output_dir_for_option("7")
            self.btn_path_link.setText(self._pretty_path(out_dir))
            self.lbl_toolkit_path_full.setText(str(out_dir))

            def runner(cancel_event: threading.Event) -> Dict[str, object]:
                success = 0
                failed = 0
                for idx, src in enumerate(files, start=1):
                    if cancel_event.is_set():
                        break
                    self.toolkit_queue.put(f"{idx}/{len(files)}")
                    pct = int(((idx - 1) / max(1, len(files))) * 100)
                    self.toolkit_queue.put(f"[{pct}%] Converting {src.name}")
                    out_file = out_dir / f"{src.stem}.mp3"
                    cmd = [ffmpeg, "-y", "-i", str(src), "-vn", "-acodec", "libmp3lame", "-q:a", "0", str(out_file)]
                    rc = run_cmd(cmd, cancel_event)
                    if rc == 0 and out_file.exists():
                        success += 1
                        self.toolkit_queue.put("done: " + str(out_file))
                    else:
                        failed += 1
                        self.toolkit_queue.put(f"error: convert failed {src.name}")
                return {"success": success, "failed": failed, "skipped": 0}

            return self._run_native_queue_job(option=option, payload=payload, task_name=task_name, runner=runner)
        return False

    def _start_native_analysis_jobs(self, option: str, payload: Dict[str, object], task_name: str) -> bool:
        if option not in {"14", "15"}:
            return False
        files = [Path(str(x)) for x in payload.get("files", [])]
        if not files:
            self.lbl_status.setText("No files selected for analysis.")
            return True
        try:
            import librosa  # type: ignore[import-not-found]
            import numpy as np  # type: ignore[import-not-found]
        except Exception:
            return False

        reports_dir = self.base_dir / "Backups" / "reports"
        reports_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = reports_dir / (f"bpm_report_{stamp}.txt" if option == "14" else f"key_report_{stamp}.txt")
        self.btn_path_link.setText(self._pretty_path(reports_dir))
        self.lbl_toolkit_path_full.setText(str(reports_dir))

        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
        note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        camelot_major = {"B": "1B", "F#": "2B", "C#": "3B", "G#": "4B", "D#": "5B", "A#": "6B", "F": "7B", "C": "8B", "G": "9B", "D": "10B", "A": "11B", "E": "12B"}
        camelot_minor = {"G#": "1A", "D#": "2A", "A#": "3A", "F": "4A", "C": "5A", "G": "6A", "D": "7A", "A": "8A", "E": "9A", "B": "10A", "F#": "11A", "C#": "12A"}

        def runner(cancel_event: threading.Event) -> Dict[str, object]:
            lines: List[str] = []
            success = 0
            failed = 0
            for idx, path in enumerate(files, start=1):
                if cancel_event.is_set():
                    break
                self.toolkit_queue.put(f"{idx}/{len(files)}")
                try:
                    self.toolkit_queue.put(f"[5%] Preparing analysis for {path.name}")
                    self.toolkit_queue.put(f"[12%] Loading {path.name}")
                    y, sr = librosa.load(str(path), sr=None, mono=True)
                    self.toolkit_queue.put(f"[24%] Decoding waveform for {path.name}")
                    if option == "14":
                        self.toolkit_queue.put(f"[42%] Detecting rhythmic peaks for {path.name}")
                        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
                        self.toolkit_queue.put(f"[68%] Measuring tempo stability for {path.name}")
                        bpm = float(tempo)
                        lines.append(f"{bpm:.2f}\t{path.name}")
                    else:
                        self.toolkit_queue.put(f"[38%] Extracting chroma profile for {path.name}")
                        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
                        self.toolkit_queue.put(f"[56%] Comparing major and minor key signatures for {path.name}")
                        vec = chroma.mean(axis=1)
                        major_scores = [np.corrcoef(np.roll(major_profile, i), vec)[0, 1] for i in range(12)]
                        minor_scores = [np.corrcoef(np.roll(minor_profile, i), vec)[0, 1] for i in range(12)]
                        m_idx = int(np.argmax(major_scores))
                        n_idx = int(np.argmax(minor_scores))
                        if major_scores[m_idx] >= minor_scores[n_idx]:
                            key = note_names[m_idx]
                            mode = "Major"
                            camelot = camelot_major.get(key, "-")
                        else:
                            key = note_names[n_idx]
                            mode = "Minor"
                            camelot = camelot_minor.get(key, "-")
                        self.toolkit_queue.put(f"[74%] Mapping Camelot wheel position for {path.name}")
                        lines.append(f"{path.name}\t{key} {mode}\t{camelot}")
                    self.toolkit_queue.put(f"[88%] Finalizing analysis for {path.name}")
                    success += 1
                    pct = int((idx / max(1, len(files))) * 100)
                    self.toolkit_queue.put(f"[{pct}%] analyzed {path.name}")
                except Exception as exc:
                    failed += 1
                    self.toolkit_queue.put(f"error: analyze failed {path.name}: {exc}")
            report_file.write_text("\n".join(lines), encoding="utf-8")
            self.toolkit_queue.put("done: " + str(report_file))
            if option == "14":
                self.toolkit_queue.put(f"BPM report saved to: {report_file}")
            else:
                self.toolkit_queue.put(f"Key report saved to: {report_file}")
            return {"success": success, "failed": failed, "skipped": 0}

        return self._run_native_queue_job(option=option, payload=payload, task_name=task_name, runner=runner)

    def _start_native_tool_option(self, option: str, payload: Dict[str, object], task_name: str) -> bool:
        if option in {"1", "2", "3", "5"}:
            return self._start_native_download_option(option, payload, task_name)
        if option == "4":
            return self._start_native_tiktok_option(option, payload, task_name)
        if option in {"6", "7", "16", "17"}:
            return self._start_native_ffmpeg_jobs(option, payload, task_name)
        if option in {"14", "15"}:
            return self._start_native_analysis_jobs(option, payload, task_name)
        return False

    def _start_native_download_option(
        self,
        option: str,
        payload: Dict[str, object],
        task_name: str,
    ) -> bool:
        if option not in {"1", "2", "3", "5"}:
            return False
        try:
            import yt_dlp  # type: ignore[import-not-found]
        except Exception:
            return False

        urls = [str(x).strip() for x in payload.get("urls", []) if str(x).strip()]
        if not urls:
            self.lbl_status.setText("Missing URL input for toolkit action.")
            return True

        output_path = str(payload.get("output_path", "")).strip()
        if not output_path:
            self._reset_toolkit_panel(task_name)
            self._set_toolkit_running_ui(False)
            self._set_toolkit_state("Error")
            self.lbl_toolkit_result.setText("Output folder is not set. Open Settings and choose an output folder.")
            self.lbl_status.setText("Download blocked: no output folder selected.")
            self._emit_web_status(immediate=True)
            return True
        out_dir = Path(output_path)
        try:
            out_dir.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            self._reset_toolkit_panel(task_name)
            self._set_toolkit_running_ui(False)
            self._set_toolkit_state("Error")
            self.lbl_toolkit_result.setText(f"Cannot use output folder: {out_dir}")
            self.lbl_status.setText(f"Download blocked: {exc}")
            self._emit_web_status(immediate=True)
            return True
        self._job_file_total = len(urls)
        self._job_file_index = 1
        self._last_run_option = option
        self._last_run_payload = deepcopy(payload)
        self._reset_toolkit_panel(task_name)
        self._set_toolkit_running_ui(True)
        self._active_toolkit_mode = "native"
        self.btn_path_link.setText(self._pretty_path(out_dir))
        self.lbl_toolkit_path_full.setText(str(out_dir))
        self._native_cancel_event.clear()

        handle = NativeToolkitProcessHandle(self._native_cancel_event.set)
        self.toolkit_proc = handle

        def worker() -> None:
            queue_success = 0
            queue_fail = 0
            queue_skip = 0
            for index, url in enumerate(urls, start=1):
                if self._native_cancel_event.is_set():
                    break
                self.toolkit_queue.put(f"{index}/{len(urls)}")
                self.toolkit_queue.put(f"Downloading: {url}")
                last_emit = {"t": 0.0}
                downloaded_path = {"value": ""}

                class _NativeLogger:
                    def __init__(self, q: "queue.Queue[str]") -> None:
                        self._q = q

                    def debug(self, msg: str) -> None:
                        m = str(msg or "").strip()
                        if m:
                            self._q.put(m)

                    def warning(self, msg: str) -> None:
                        m = str(msg or "").strip()
                        if m:
                            self._q.put(f"warning: {m}")

                    def error(self, msg: str) -> None:
                        m = str(msg or "").strip()
                        if m:
                            self._q.put(f"error: {m}")

                def hook(data: Dict[str, object]) -> None:
                    if self._native_cancel_event.is_set():
                        raise Exception("Canceled by user")
                    info_dict = data.get("info_dict")
                    if isinstance(info_dict, dict):
                        hook_title = str(info_dict.get("title", "")).strip()
                        if hook_title:
                            self.toolkit_queue.put(f"title: {hook_title}")
                        try:
                            p_idx = int(info_dict.get("playlist_index") or 0)
                            p_total = int(info_dict.get("playlist_count") or 0)
                            if p_idx > 0 and p_total > 0:
                                self.toolkit_queue.put(f"{p_idx}/{p_total}")
                        except Exception:
                            pass
                    status = str(data.get("status", "")).lower()
                    if status == "downloading":
                        now = time.monotonic()
                        if now - last_emit["t"] < 0.12:
                            return
                        last_emit["t"] = now
                        total = data.get("total_bytes") or data.get("total_bytes_estimate")
                        done = data.get("downloaded_bytes")
                        pct = 0
                        try:
                            if total and done:
                                pct = int((float(done) / max(1.0, float(total))) * 100)
                        except Exception:
                            pct = 0
                        pct = max(0, min(100, pct))
                        speed = self._fmt_speed(float(data.get("speed", 0) or 0))
                        eta = self._fmt_eta(float(data.get("eta", 0) or 0))
                        self.toolkit_queue.put(f"[{pct}%] speed: {speed} eta {eta}")
                    elif status == "finished":
                        filename = str(data.get("filename", "")).strip()
                        if filename:
                            downloaded_path["value"] = filename
                            self.toolkit_queue.put(f"done: {filename}")
                            self.toolkit_queue.put("Download done")

                ydl_opts: Dict[str, object] = {
                    "noplaylist": not (("list=" in str(url).lower()) or ("/playlist" in str(url).lower())),
                    "quiet": True,
                    "no_warnings": True,
                    "logger": _NativeLogger(self.toolkit_queue),
                    "progress_hooks": [hook],
                    "windowsfilenames": True,
                    "outtmpl": str(out_dir / "%(title).180s.%(ext)s"),
                    "retries": 10,
                    "fragment_retries": 10,
                    "concurrent_fragment_downloads": 8,
                    "nopart": False,
                }
                quality = str(payload.get("quality", str(self.config.get("default_video_quality", "1080p")))).strip()
                if option == "5":
                    ydl_opts["format"] = "bestaudio/best"
                    ydl_opts["postprocessors"] = [
                        {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "0"}
                    ]
                elif option == "2":
                    # Fallback profile with requested quality cap.
                    ydl_opts["format"] = self._video_format_for_quality(quality, strict_avc=True)
                else:
                    # Main profile with requested quality cap.
                    ydl_opts["format"] = self._video_format_for_quality(quality, strict_avc=True)
                if option in {"1", "2", "3"}:
                    ydl_opts["merge_output_format"] = "mp4"
                    ydl_opts["postprocessors"] = [{"key": "FFmpegVideoRemuxer", "preferedformat": "mp4"}]
                    # Improve streaming/seek behavior by placing MOOV atom at file start.
                    ydl_opts["postprocessor_args"] = ["-movflags", "+faststart"]

                cookies = str(payload.get("cookies", "")).strip()
                if cookies and Path(cookies).exists():
                    ydl_opts["cookiefile"] = cookies

                if shutil.which("aria2c"):
                    ydl_opts["external_downloader"] = "aria2c"
                    ydl_opts["external_downloader_args"] = ["-x16", "-s16", "-k1M", "--summary-interval=1"]

                try:
                    title = ""
                    vid = self._extract_youtube_video_id(url)
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([url])
                    queue_success += 1
                except Exception as exc:
                    queue_fail += 1
                    self.toolkit_queue.put(f"error: {exc}")
            if self._native_cancel_event.is_set():
                self.toolkit_queue.put("error: Task stopped by user.")
                handle.set_returncode(1)
            else:
                self.toolkit_queue.put(
                    f"Queue done. success={queue_success}, failed={queue_fail}, skipped={queue_skip}"
                )
                handle.set_returncode(0)
            self.toolkit_queue.put(f"[toolkit finished] exit code: {handle.poll()}")

        threading.Thread(target=worker, daemon=True).start()
        QtCore.QTimer.singleShot(100, self._poll_toolkit_queue)
        self.lbl_status.setText("Native downloader started.")
        self._emit_web_status(immediate=True)
        return True

    def _launch_toolkit_option(
        self,
        option: str,
        payload: Dict[str, object],
        title_map: Dict[str, str],
        fn_map: Dict[str, str],
        script_path: Path,
    ) -> None:
        fn = fn_map.get(option)
        if not fn:
            self.lbl_status.setText(f"Unsupported toolkit option: {option}")
            return
        native_only = {"1", "2", "3", "4", "5", "6", "7", "14", "15", "16", "17"}
        task_name = title_map.get(option, f"Running option {option}")
        if self._start_native_tool_option(option, payload, task_name):
            return
        if option in native_only:
            self._reset_toolkit_panel(task_name)
            self._set_toolkit_running_ui(False)
            self._set_toolkit_state("Error")
            self.lbl_toolkit_result.setText("Native runtime missing or unsupported for this option. Install required dependencies.")
            self.lbl_status.setText("Native option unavailable; PowerShell fallback disabled for this option.")
            self._emit_web_status(immediate=True)
            return
        self._job_file_total = len(payload.get("urls", [])) + len(payload.get("files", [])) + len(payload.get("one_files", []))
        if self._job_file_total <= 0:
            self._job_file_total = 1
        self._job_file_index = 1
        self._last_run_option = option
        self._last_run_payload = deepcopy(payload)
        script_dir = script_path.parent
        cmd = self._build_toolkit_command(script_dir, option, fn, payload)
        exe = shutil.which("pwsh") or "powershell"
        args = [exe, "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd]
        try:
            self._active_toolkit_mode = "script"
            self._show_toolkit_workflow()
            self._reset_toolkit_panel(title_map.get(option, f"Running option {option}"))
            self._set_toolkit_running_ui(True)
            self._toolkit_started_mono = time.monotonic()
            self._toolkit_last_output_mono = self._toolkit_started_mono
            self._toolkit_first_progress_mono = 0.0
            self.toolkit_proc = subprocess.Popen(
                args=args,
                cwd=str(script_dir),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            threading.Thread(target=self._read_toolkit_output, daemon=True).start()
            QtCore.QTimer.singleShot(100, self._poll_toolkit_queue)
            self._emit_web_status(immediate=True)
        except Exception as exc:
            self._set_toolkit_running_ui(False)
            self._set_toolkit_state("Error")
            self.toolkit_progress.setValue(0)
            self.lbl_toolkit_result.setText("Failed to start toolkit job.")
            self.lbl_status.setText(f"Failed to launch toolkit: {exc}")
            self._emit_web_status(immediate=True)

    def run_toolkit_full_menu(self) -> None:
        if self.toolkit_proc and self.toolkit_proc.poll() is None:
            self.lbl_status.setText("Toolkit task already running.")
            return
        script_path = self.base_dir / "DJ_TOOLKIT_V2_PACK" / "DJ_TOOLKIT_V2.ps1"
        if not script_path.exists():
            self.lbl_status.setText("DJ_TOOLKIT_V2.ps1 not found.")
            return
        script_dir = script_path.parent
        self._last_run_option = ""
        self._last_run_payload = {}
        cmd = (
            "$ErrorActionPreference='Stop'; "
            "$env:DJ_TOOLKIT_RUN='1'; "
            "$env:NO_COLOR='1'; "
            "$PSStyle.OutputRendering='PlainText'; "
            f"Set-Location '{script_dir}'; "
            "& .\\DJ_TOOLKIT_V2.ps1"
        )
        exe = shutil.which("pwsh") or "powershell"
        args = [exe, "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd]
        try:
            self._show_toolkit_workflow()
            self._reset_toolkit_panel("Opening Full Toolkit Menu")
            self._set_toolkit_running_ui(True)
            self.toolkit_proc = subprocess.Popen(
                args=args,
                cwd=str(script_dir),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            threading.Thread(target=self._read_toolkit_output, daemon=True).start()
            QtCore.QTimer.singleShot(100, self._poll_toolkit_queue)
            self.lbl_status.setText("Full toolkit menu started in-app.")
        except Exception as exc:
            self._set_toolkit_running_ui(False)
            self._set_toolkit_state("Error")
            self.lbl_toolkit_result.setText("Could not start full toolkit mode.")
            self.lbl_status.setText(f"Failed to launch full toolkit menu: {exc}")

    def _read_toolkit_output(self) -> None:
        p = self.toolkit_proc
        if p is None or p.stdout is None:
            return
        try:
            for line in p.stdout:
                self.toolkit_queue.put(line.rstrip("\n"))
        except Exception as exc:
            self.toolkit_queue.put(f"[toolkit read error] {exc}")
        finally:
            self.toolkit_queue.put(f"[toolkit finished] exit code: {p.poll()}")

    def _poll_toolkit_queue(self) -> None:
        had = False
        while True:
            try:
                line = self.toolkit_queue.get_nowait()
            except queue.Empty:
                break
            had = True
            self._toolkit_last_output_mono = time.monotonic()
            self._log_toolkit_line(line)
            self._consume_toolkit_line(line)
            self._refresh_status_rail()
        if self.toolkit_proc and self.toolkit_proc.poll() is None:
            now_mono = time.monotonic()
            if self._last_run_option in {"1", "2", "3", "4", "5"}:
                if self._toolkit_first_progress_mono <= 0.0:
                    wait_s = int(max(0.0, now_mono - self._toolkit_started_mono))
                    if wait_s >= 4:
                        self.lbl_toolkit_result.setText(f"Connecting / fetching metadata... {wait_s}s")
                    silence_s = now_mono - max(self._toolkit_started_mono, self._toolkit_last_output_mono)
                    if silence_s >= self._toolkit_silence_timeout_sec:
                        try:
                            self.toolkit_proc.terminate()
                        except Exception:
                            pass
                        self._toolkit_error_seen = True
                        self._set_toolkit_running_ui(False)
                        self._set_toolkit_state("Error")
                        self.lbl_toolkit_result.setText("Timed out waiting for downloader output. Retry the link or use cookies mode.")
                        self.lbl_toolkit_eta.setText("--")
                        self.btn_retry_error.setVisible(True)
                        self.btn_open_logs.setVisible(True)
                        self.lbl_status.setText("Downloader timed out waiting for progress.")
                        self._refresh_status_rail()
                        return
            QtCore.QTimer.singleShot(120, self._poll_toolkit_queue)
        else:
            if not self.toolkit_proc:
                return
            self._set_toolkit_running_ui(False)
            code = self.toolkit_proc.poll() if self.toolkit_proc else 1
            had_real_success = bool(
                (self._toolkit_last_saved_path and self._toolkit_last_saved_path.exists())
                or self._queue_success_count > 0
            )
            had_queue_failure = self._queue_fail_count > 0
            had_skip_only = code == 0 and not self._toolkit_error_seen and not had_queue_failure and (self._queue_skip_count > 0) and not had_real_success
            if code == 0 and not self._toolkit_error_seen and not had_queue_failure and (had_real_success or had_skip_only):
                self._set_toolkit_state("Completed")
                self._set_progress_smooth(100)
                total_done = max(1, self._job_file_total)
                label = "file" if total_done == 1 else "files"
                if had_skip_only:
                    self.toolkit_progress.setFormat(f"✔ Completed — already downloaded")
                    self.lbl_toolkit_result.setText("File already exists in archive. Skipped download.")
                else:
                    self.toolkit_progress.setFormat(f"✔ Completed — {total_done} {label} processed")
                    self.lbl_toolkit_result.setText("File saved successfully")
                self.lbl_toolkit_eta.setText("00:00 remaining")
                self.lbl_toolkit_speed.setText("--")
                self.btn_retry_error.setVisible(False)
                self.btn_open_logs.setVisible(False)
                self._record_recent_job(True)
                self._play_ui_sound("done")
                if self._last_run_option == "14":
                    bpm_text = self._load_bpm_result_text()
                    self._set_toolkit_status_mode("bpm", bpm_text)
                elif self._last_run_option == "15":
                    self.lbl_keydetect_last.setText("Key detection completed. Check toolkit output files for Camelot results.")
                    self.complete_card.setVisible(True)
                else:
                    self.complete_card.setVisible(True)
                self.btn_open_folder.setEnabled(self._resolve_output_folder() is not None)
                self.btn_open_file.setEnabled(self._toolkit_last_saved_path is not None and self._toolkit_last_saved_path.exists())
            else:
                self._set_toolkit_state("Error")
                if not self._toolkit_last_message:
                    if had_queue_failure:
                        self._toolkit_last_message = (
                            f"Task failed ({self._queue_fail_count} failed, "
                            f"{self._queue_success_count} succeeded). Check logs."
                        )
                    elif code == 0 and not had_real_success:
                        self._toolkit_last_message = "No file was downloaded. Verify the URL and retry."
                    else:
                        self._toolkit_last_message = "Task failed. Check hidden debug log."
                elif code == 0 and not had_real_success and not self._toolkit_last_message:
                    self._toolkit_last_message = "No file was downloaded. Verify the URL and retry."
                if code == 0 and had_queue_failure and not self._toolkit_last_message:
                    self._toolkit_last_message = "Task failed. Check hidden debug log."
                self.lbl_toolkit_result.setText(self._toolkit_last_message)
                self.lbl_toolkit_eta.setText("--")
                self.btn_retry_error.setVisible(True)
                self.btn_open_logs.setVisible(True)
                self._record_recent_job(False)
                self._play_ui_sound("action_needed")
                self.complete_card.setVisible(False)
            self._refresh_status_rail()
            self.lbl_status.setText("Toolkit task finished.")
            self._emit_web_status(immediate=True)

    def _reset_toolkit_panel(self, task_name: str) -> None:
        self._toolkit_error_seen = False
        self._toolkit_last_message = ""
        self._toolkit_source_title = ""
        self._toolkit_started_at = datetime.now()
        self._toolkit_last_saved_path = None
        self._last_bpm_report_path = None
        self._toolkit_progress_peak = 0
        self._queue_success_count = 0
        self._queue_fail_count = 0
        self._queue_skip_count = 0
        self._toolkit_started_mono = time.monotonic()
        self._toolkit_last_output_mono = self._toolkit_started_mono
        self._toolkit_first_progress_mono = 0.0
        self._toolkit_eta_from_stream = False
        self._toolkit_eta_last_update_mono = 0.0
        self._active_toolkit_mode = "script"
        self._set_toolkit_status_mode("normal")
        self.lbl_toolkit_task.setText(task_name)
        self._set_toolkit_state("Processing")
        self.toolkit_progress.setValue(0)
        self.lbl_toolkit_eta.setText("--")
        self.btn_path_link.setText("DJDownloads > MP4")
        self.lbl_toolkit_path_full.setText("-")
        self.lbl_toolkit_speed.setText("-- MB/s")
        self.lbl_toolkit_result.setText("")
        if hasattr(self, "activity_progress"):
            self.activity_progress.setValue(0)
        if hasattr(self, "lbl_activity_task"):
            self.lbl_activity_task.setText(task_name)
        if hasattr(self, "lbl_activity_eta"):
            self.lbl_activity_eta.setText("--")
        self.complete_card.setVisible(False)
        self.btn_retry_error.setVisible(False)
        self.btn_open_logs.setVisible(False)
        self._update_progress_text(0)
        self._refresh_status_rail()

    def _set_toolkit_state(self, state: str) -> None:
        state_low = state.lower()
        running_state = False
        if "download" in state_low:
            text = "⏳ Downloading"
            self._status_base_color = QtGui.QColor(92, 74, 210, 205)
            self._progress_glow.setColor(QtGui.QColor(147, 79, 255, 150))
            running_state = True
        elif "error" in state_low or "fail" in state_low:
            text = "⚡ Error"
            self._status_base_color = QtGui.QColor(180, 66, 90, 215)
            self._progress_glow.setColor(QtGui.QColor(223, 96, 120, 145))
        elif "idle" in state_low:
            text = ""
            self._status_base_color = QtGui.QColor(63, 86, 140, 185)
            self._progress_glow.setColor(QtGui.QColor(98, 132, 205, 115))
        elif "complete" in state_low:
            text = "✔ Completed"
            self._status_base_color = QtGui.QColor(56, 132, 88, 205)
            self._progress_glow.setColor(QtGui.QColor(84, 198, 136, 120))
        else:
            text = "⏳ Processing"
            self._status_base_color = QtGui.QColor(88, 73, 166, 205)
            self._progress_glow.setColor(QtGui.QColor(128, 96, 236, 145))
            running_state = True
        self.lbl_toolkit_status.setText(text)
        self._apply_status_style(1.0)
        if running_state:
            if self._status_pulse.state() != QtCore.QAbstractAnimation.Running:
                self._status_pulse.start()
        else:
            if self._status_pulse.state() == QtCore.QAbstractAnimation.Running:
                self._status_pulse.stop()
        self._refresh_status_rail()

    def _log_toolkit_line(self, line: str) -> None:
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        try:
            with self.toolkit_log_path.open("a", encoding="utf-8") as log_file:
                log_file.write(f"{stamp} {line}\n")
        except Exception:
            pass

    def _on_glow_pulse(self, value: object) -> None:
        try:
            blur = float(value)
        except (TypeError, ValueError):
            return
        self._progress_glow.setBlurRadius(blur)
        alpha = int(max(80, min(170, 70 + blur * 2.4)))
        self._progress_glow.setColor(QtGui.QColor(147, 79, 255, alpha))

    def _on_status_pulse(self, value: object) -> None:
        try:
            pulse = float(value)
        except (TypeError, ValueError):
            pulse = 1.0
        self._apply_status_style(pulse)

    def _apply_status_style(self, pulse: float = 1.0) -> None:
        c = QtGui.QColor(self._status_base_color)
        alpha = int(max(90, min(255, c.alpha() * pulse)))
        c.setAlpha(alpha)
        self.lbl_toolkit_status.setStyleSheet(
            f"border-radius:16px;padding:6px 14px;background:{c.name(QtGui.QColor.HexArgb)};color:#eef2ff;font-weight:600;"
        )

    def _on_bar_accent_phase(self, value: object) -> None:
        try:
            phase = float(value)
        except (TypeError, ValueError):
            phase = 0.0
        if self._current_theme == "light":
            c1 = QtGui.QColor(232, 90, 159)
            c2 = QtGui.QColor(127, 109, 240)
        else:
            c1 = QtGui.QColor(209, 81, 149)
            c2 = QtGui.QColor(111, 95, 224)
        t = (phase * 0.6) + 0.2
        s1 = max(0.0, min(1.0, t - 0.2))
        s2 = max(0.0, min(1.0, t + 0.2))
        self.toolkit_progress.setStyleSheet(
            "QProgressBar{border:1px solid rgba(108,124,178,0.28);border-radius:12px;text-align:right;padding-right:12px;min-height:28px;font-size:14px;font-weight:700;}"
            f"QProgressBar::chunk{{background:qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 {c1.name()}, stop:{s1:.3f} {c1.name()}, stop:{s2:.3f} {c2.name()}, stop:1 {c2.name()});border-radius:11px;}}"
        )

    def _consume_toolkit_line(self, line: str) -> None:
        clean = self._clean_toolkit_output(line).strip()
        if not clean:
            return
        lower = clean.lower()
        title_match = re.search(r"^title:\s*(.+)$", clean, flags=re.IGNORECASE)
        if title_match:
            title = title_match.group(1).strip()
            if title:
                self._toolkit_source_title = title
                self.lbl_toolkit_task.setText(title)
            return
        if "already been downloaded" in lower or "has already been downloaded" in lower or lower.startswith("already exists:"):
            self._queue_skip_count += 1
            if not self._toolkit_last_message:
                self._toolkit_last_message = "File already exists in output folder. Skipped download."
            return
        if lower.startswith("[toolkit finished]"):
            return
        if "saves to:" in lower or "saved to:" in lower or "saving to:" in lower or lower.startswith("stems folder:"):
            parts = clean.split(":", 1)
            if len(parts) == 2 and parts[1].strip():
                path_text = parts[1].strip()
                self._capture_saved_path(path_text)
        bpm_report_match = re.search(r"bpm report saved to:\s*(.+)$", clean, flags=re.IGNORECASE)
        if bpm_report_match:
            p = Path(bpm_report_match.group(1).strip())
            if p.exists():
                self._last_bpm_report_path = p
        ytdlp_match = re.search(
            r"\bat\s+([0-9.]+\s*[KMG]i?B/s)\s+ETA\s+([0-9:]+)",
            clean,
            flags=re.IGNORECASE,
        )
        if ytdlp_match:
            speed = ytdlp_match.group(1).replace("iB/s", "B/s")
            self.lbl_toolkit_speed.setText(speed)
            self.lbl_toolkit_eta.setText(f"{ytdlp_match.group(2)} remaining")
            self._toolkit_eta_from_stream = True
            self._toolkit_eta_last_update_mono = time.monotonic()
        speed_match = re.search(r"(?:speed[:\s])\s*([0-9.]+\s*[kmg]?i?b/s)", clean, flags=re.IGNORECASE)
        if speed_match:
            spd = speed_match.group(1).replace("iB/s", "B/s").replace("ib/s", "B/s")
            self.lbl_toolkit_speed.setText(spd)
        count_match = re.search(r"^\s*(\d{1,4})\s*/\s*(\d{1,4})\s*$", clean)
        if count_match:
            cur, total = int(count_match.group(1)), int(count_match.group(2))
            if total > 0 and cur <= total:
                self._job_file_total = total
                self._job_file_index = max(1, cur)
        m = re.search(r"\[(\d{1,3})%\]", clean)
        if m:
            pct = max(0, min(100, int(m.group(1))))
            if self._toolkit_first_progress_mono <= 0.0:
                self._toolkit_first_progress_mono = time.monotonic()
                startup_delay = int(max(0.0, self._toolkit_first_progress_mono - self._toolkit_started_mono))
                if startup_delay >= 2:
                    self.lbl_status.setText(f"Download stream started after {startup_delay}s.")
            self._set_progress_smooth(pct)
            self._update_eta_from_pct(pct)
            if pct < 100:
                self._set_toolkit_state("Processing")
        eta_match = re.search(r"eta\s+([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)", clean, flags=re.IGNORECASE)
        if eta_match:
            self.lbl_toolkit_eta.setText(f"{eta_match.group(1)} remaining")
            self._toolkit_eta_from_stream = True
            self._toolkit_eta_last_update_mono = time.monotonic()
        if "download" in lower and "done" not in lower:
            self._set_toolkit_state("Downloading")
        elif "extract" in lower and "audio" in lower:
            self._set_toolkit_state("Processing")
        elif "merg" in lower or "processing" in lower or "converting" in lower or "analyz" in lower:
            self._set_toolkit_state("Processing")
        done_match = re.search(r"done:\s*(.+)$", clean, flags=re.IGNORECASE)
        if done_match:
            self._capture_saved_path(done_match.group(1).strip())
        queue_summary = re.search(
            r"queue\s+done\.\s*success\s*=\s*(\d+)\s*,\s*failed\s*=\s*(\d+)\s*,\s*skipped\s*=\s*(\d+)",
            clean,
            flags=re.IGNORECASE,
        )
        if queue_summary:
            self._queue_success_count = int(queue_summary.group(1))
            self._queue_fail_count = int(queue_summary.group(2))
            self._queue_skip_count = int(queue_summary.group(3))
            if self._queue_fail_count > 0:
                self._toolkit_error_seen = True
                if not self._toolkit_last_message:
                    self._toolkit_last_message = (
                        f"Task failed ({self._queue_fail_count} failed, {self._queue_success_count} succeeded)."
                    )
        if self._active_toolkit_mode == "native":
            is_error_line = lower.startswith("error:")
        else:
            is_error_line = self._line_is_error(lower)
        if is_error_line:
            self._toolkit_error_seen = True
            self._set_toolkit_state("Error")
            if (
                "sign in to confirm your age" in lower
                or "confirm your age" in lower
                or "age-restricted" in lower
                or "age restricted" in lower
                or "inappropriate for some users" in lower
                or "requires age verification" in lower
                or "use --cookies" in lower
                or "use --cookies-from-browser" in lower
                or "sign in to prove you're not a bot" in lower
            ):
                self._toolkit_last_message = (
                    "This video is age-restricted/login-protected. Enable Cookies mode in the YouTube modal and provide cookies.txt."
                )
            elif "private video" in lower or "members-only" in lower:
                self._toolkit_last_message = "This video is private or members-only. Sign-in cookies are required."
            elif not self._toolkit_last_message:
                detail = clean
                if lower.startswith("error:"):
                    detail = clean.split(":", 1)[1].strip() or clean
                self._toolkit_last_message = detail[:240]

    def _line_is_error(self, lower_line: str) -> bool:
        if "exception" in lower_line or "traceback" in lower_line:
            return True
        if "error" in lower_line:
            if any(ok in lower_line for ok in ["0 error", "errors: 0", "errorlevel 0"]):
                return False
            return True
        if "failed" in lower_line or "failures" in lower_line:
            if re.search(r"fail(?:ed|ures?)\s*[=:]\s*0\b", lower_line):
                return False
            if "not failed" in lower_line:
                return False
            return True
        if "not found" in lower_line:
            return True
        return False

    def _set_progress_smooth(self, value: int) -> None:
        value = max(0, min(100, int(value)))
        # Keep progress monotonic to avoid jitter/backward jumps from mixed tool output lines.
        if value < self._toolkit_progress_peak:
            value = self._toolkit_progress_peak
        else:
            self._toolkit_progress_peak = value
        start = self.toolkit_progress.value()
        now = time.monotonic()
        if now - self._last_progress_anim_ts < 0.08 and abs(start - value) <= 6:
            self.toolkit_progress.setValue(value)
            self._update_progress_text(value)
            return
        if abs(start - value) <= 1:
            self.toolkit_progress.setValue(value)
            if hasattr(self, "activity_progress"):
                self.activity_progress.setValue(value)
            self._update_progress_text(value)
            return
        self._toolkit_progress_anim.stop()
        self._toolkit_progress_anim.setStartValue(start)
        self._toolkit_progress_anim.setEndValue(value)
        self._toolkit_progress_anim.start()
        self._last_progress_anim_ts = now
        if hasattr(self, "activity_progress"):
            self.activity_progress.setValue(value)
        self._update_progress_text(value)

    def _update_progress_text(self, value: int) -> None:
        current = min(self._job_file_total, max(1, self._job_file_index))
        total = max(1, self._job_file_total)
        self.toolkit_progress.setFormat(f"{int(value)}%  {current}/{total}")

    def _update_eta_from_pct(self, pct: int) -> None:
        if self._last_run_option in {"16", "17", "14", "15", "7", "13"}:
            self.lbl_toolkit_eta.setText("--")
            return
        if pct <= 0 or pct >= 100 or self._toolkit_started_at is None:
            return
        now_mono = time.monotonic()
        if self._toolkit_eta_from_stream and (now_mono - self._toolkit_eta_last_update_mono) < 3.0:
            return
        if pct < 5:
            return
        elapsed = (datetime.now() - self._toolkit_started_at).total_seconds()
        if elapsed < 4:
            return
        total_est = elapsed / max(0.01, pct / 100.0)
        remaining = max(0, int(total_est - elapsed))
        mm, ss = divmod(remaining, 60)
        hh, mm = divmod(mm, 60)
        if hh > 0:
            self.lbl_toolkit_eta.setText(f"{hh:02d}:{mm:02d}:{ss:02d} remaining")
        else:
            self.lbl_toolkit_eta.setText(f"{mm:02d}:{ss:02d} remaining")

    def _set_toolkit_running_ui(self, running: bool) -> None:
        self.btn_stop_toolkit.setVisible(running)
        if running:
            if self._glow_pulse.state() != QtCore.QAbstractAnimation.Running:
                self._glow_pulse.start()
            if self._bar_accent_anim.state() != QtCore.QAbstractAnimation.Running:
                self._bar_accent_anim.start()
        else:
            if self._glow_pulse.state() == QtCore.QAbstractAnimation.Running:
                self._glow_pulse.stop()
            if self._bar_accent_anim.state() == QtCore.QAbstractAnimation.Running:
                self._bar_accent_anim.stop()
            self._progress_glow.setBlurRadius(0.0)
            self._progress_glow.setColor(QtGui.QColor(147, 79, 255, 0))

    def _set_toolkit_status_mode(self, mode: str, bpm_text: str = "") -> None:
        normal_widgets = [
            self.lbl_toolkit_status,
            self.toolkit_progress,
            self.lbl_toolkit_eta,
            self.btn_stop_toolkit,
            self.lbl_save_title,
            self.lbl_folder_icon,
            self.btn_path_link,
            self.btn_open_path_inline,
            self.lbl_toolkit_path_full,
            self.lbl_toolkit_speed,
            self.lbl_toolkit_result,
            self.btn_retry_error,
            self.btn_open_logs,
            self.recent_card,
            self.complete_card,
        ]
        if mode == "bpm":
            for w in normal_widgets:
                w.setVisible(False)
            self.lbl_toolkit_task.setText("Detected BPM")
            self.lbl_bpm_result.setText(bpm_text or "No BPM values found.")
            self.lbl_bpm_result.setVisible(True)
            return
        self.lbl_bpm_result.setVisible(False)
        for w in normal_widgets:
            w.setVisible(True)

    def _load_bpm_result_text(self) -> str:
        path = self._last_bpm_report_path
        if path is None or not path.exists():
            return "No BPM report found."
        rows: List[str] = []
        try:
            for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = raw.strip()
                if not line:
                    continue
                if "\t" in line:
                    bpm, name = line.split("\t", 1)
                    rows.append(f"{name}: {bpm} BPM")
                else:
                    rows.append(line)
        except Exception:
            return "Could not read BPM report."
        if not rows:
            return "No BPM values found."
        return "\n".join(rows[:8])

    def _load_key_result_payload(self) -> Dict[str, str]:
        path = self._toolkit_last_saved_path
        if path is None or not path.exists() or not path.is_file():
            return {}
        try:
            for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = raw.strip()
                if not line or "\t" not in line:
                    continue
                parts = [part.strip() for part in line.split("\t") if part.strip()]
                if len(parts) < 3:
                    continue
                return {
                    "filename": parts[0],
                    "musicalKey": parts[1],
                    "key": parts[2],
                    "camelotKey": parts[2],
                    "bpm": "--",
                }
        except Exception:
            return {}
        return {}

    def _record_recent_job(self, success: bool) -> None:
        if self._toolkit_last_saved_path and self._toolkit_last_saved_path.exists():
            name = self._toolkit_last_saved_path.name
            if self._should_ignore_output_file(self._toolkit_last_saved_path):
                name = self.lbl_toolkit_task.text().strip() or "Toolkit job"
        else:
            name = self.lbl_toolkit_task.text().strip() or "Toolkit job"
        state_label = "✔ Completed" if success else "❌ Failed"
        entry = {
            "ok": success,
            "name": name,
            "path": str(self._toolkit_last_saved_path) if self._toolkit_last_saved_path else "",
            "option": self._last_run_option or "",
            "payload": deepcopy(self._last_run_payload) if self._last_run_payload else {},
            "state": state_label,
        }
        self._recent_jobs.insert(0, entry)
        self._recent_jobs = self._recent_jobs[:8]
        self.refresh_recent_jobs_list()


    def _play_ui_sound(self, kind: str) -> None:
        if winsound is None:
            return
        try:
            sounds_dir = self.base_dir / "Sounds"
            name = "done.wav" if kind == "done" else "action_needed.wav"
            sound_file = sounds_dir / name
            if not sound_file.exists():
                return
            winsound.PlaySound(str(sound_file), winsound.SND_FILENAME | winsound.SND_ASYNC | winsound.SND_NODEFAULT)
        except Exception:
            pass
    def clear_recent_jobs(self) -> None:
        self._recent_jobs.clear()
        self.refresh_recent_jobs_list()

    def refresh_recent_jobs_list(self) -> None:
        self.list_recent_jobs.clear()
        if hasattr(self, "list_activity_jobs"):
            self.list_activity_jobs.clear()
        mode = self.cmb_recent_filter.currentText().strip().lower() if hasattr(self, "cmb_recent_filter") else "all"
        for entry in self._recent_jobs:
            ok = bool(entry.get("ok"))
            if mode == "success" and not ok:
                continue
            if mode == "failed" and ok:
                continue
            item = QtWidgets.QListWidgetItem(f"{entry.get('state', '🔄 Running')} {entry.get('name', 'Toolkit job')}")
            item.setData(QtCore.Qt.UserRole, entry)
            self.list_recent_jobs.addItem(item)
            if hasattr(self, "list_activity_jobs"):
                a_item = QtWidgets.QListWidgetItem(f"{entry.get('state', '🔄 Running')} {entry.get('name', 'Toolkit job')}")
                a_item.setData(QtCore.Qt.UserRole, entry)
                self.list_activity_jobs.addItem(a_item)

    def retry_selected_recent_job(self) -> None:
        item = self.list_recent_jobs.currentItem()
        if not item:
            self.lbl_status.setText("Select a recent job first.")
            return
        entry = item.data(QtCore.Qt.UserRole) or {}
        option = str(entry.get("option", "")).strip()
        if not option:
            self.lbl_status.setText("This job cannot be retried.")
            return
        # Re-run by option; input dialog appears again for safety.
        self.run_toolkit_option(option)

    def open_selected_recent_output(self) -> None:
        item = self.list_recent_jobs.currentItem()
        if not item:
            self.lbl_status.setText("Select a recent job first.")
            return
        entry = item.data(QtCore.Qt.UserRole) or {}
        p = str(entry.get("path", "")).strip()
        if not p:
            self.lbl_status.setText("No output path on this recent job.")
            return
        path = Path(p)
        target = path if path.is_dir() else path.parent
        if not target.exists():
            self.lbl_status.setText("Saved output path no longer exists.")
            return
        QtGui.QDesktopServices.openUrl(QtCore.QUrl.fromLocalFile(str(target)))

    def retry_last_job(self) -> None:
        if not self._last_run_option:
            self.lbl_status.setText("No previous runnable job to retry.")
            return
        self.run_toolkit_option(self._last_run_option)

    def open_toolkit_logs(self) -> None:
        QtGui.QDesktopServices.openUrl(QtCore.QUrl.fromLocalFile(str(self.toolkit_log_path)))

    def _capture_saved_path(self, raw: str) -> None:
        txt = raw.strip().strip('"').strip("'")
        if not txt:
            return
        p = Path(txt)
        if p.exists():
            if p.is_file():
                if self._should_ignore_output_file(p):
                    return
                self._toolkit_last_saved_path = p
                self.btn_path_link.setText(self._pretty_path(p.parent))
                self.lbl_toolkit_path_full.setText(str(p.parent))
            else:
                self._toolkit_last_saved_path = p
                self.btn_path_link.setText(self._pretty_path(p))
                self.lbl_toolkit_path_full.setText(str(p))

    def _should_ignore_output_file(self, path: Path) -> bool:
        name = path.name.lower()
        if name in {".download_archive.txt", "download_archive.txt"}:
            return True
        if name.endswith(".part") or name.endswith(".ytdl"):
            return True
        return False

    def _relocate_internal_artifacts(self, out_dir: Path) -> None:
        internal_dir = self.base_dir / "Backups" / "internal"
        internal_dir.mkdir(parents=True, exist_ok=True)
        candidates = [
            out_dir / ".download_archive.txt",
            out_dir / "download_archive.txt",
            out_dir / ".DOWNLOAD_ARCHIVE.TXT",
            out_dir / "DOWNLOAD_ARCHIVE.TXT",
        ]
        for p in candidates:
            try:
                if not p.exists() or not p.is_file():
                    continue
                stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                target = internal_dir / f"{stamp}_{p.name}"
                i = 1
                while target.exists():
                    target = internal_dir / f"{stamp}_{i}_{p.name}"
                    i += 1
                shutil.move(str(p), str(target))
            except Exception:
                # Best-effort cleanup; ignore failures.
                pass

    def _pretty_path(self, path: Path) -> str:
        parts = list(path.parts)
        if "DJDownloads" in parts:
            idx = parts.index("DJDownloads")
            remainder = [x for x in parts[idx + 1 :] if x not in ("\\", "/")]
            if remainder:
                return "DJDownloads > " + " > ".join(remainder)
            return "DJDownloads"
        if len(parts) >= 2:
            return " > ".join(parts[-2:])
        return str(path)

    def _resolve_output_folder(self) -> Optional[Path]:
        if self._toolkit_last_saved_path and self._toolkit_last_saved_path.exists():
            return self._toolkit_last_saved_path if self._toolkit_last_saved_path.is_dir() else self._toolkit_last_saved_path.parent
        path_text = self.lbl_toolkit_path_full.text().strip()
        if path_text and path_text != "-":
            p = Path(path_text)
            if p.exists():
                return p if p.is_dir() else p.parent
        return None

    def open_last_folder(self) -> None:
        folder = self._resolve_output_folder()
        if folder is None:
            self.lbl_status.setText("No output folder available.")
            return
        QtGui.QDesktopServices.openUrl(QtCore.QUrl.fromLocalFile(str(folder)))

    def open_last_file(self) -> None:
        if not self._toolkit_last_saved_path or not self._toolkit_last_saved_path.exists():
            self.lbl_status.setText("No output file available.")
            return
        target = self._toolkit_last_saved_path
        if target.is_dir():
            self.lbl_status.setText("Opening output folder.")
        QtGui.QDesktopServices.openUrl(QtCore.QUrl.fromLocalFile(str(target)))

    def _clean_toolkit_output(self, text: str) -> str:
        text = self._ansi_re.sub("", text)
        text = re.sub(r"\[[0-9;]{1,12}m", "", text)
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
        text = text.replace("\r", "")
        text = text.replace("\uFFFD", "")
        return text

    def _prompt_urls(self, helper_text: str = "Paste one URL per line:") -> Optional[List[str]]:
        dlg = UrlInputDialog(self, helper=helper_text)
        if dlg.exec() != QtWidgets.QDialog.Accepted:
            return None
        urls = dlg.urls()
        if not urls:
            return None
        return urls

    def _prompt_fallback_download(self) -> Optional[Dict[str, object]]:
        dlg = FallbackDownloadDialog(self)
        if dlg.exec() != QtWidgets.QDialog.Accepted:
            return None
        payload = dlg.payload()
        urls = payload.get("urls", [])
        if not isinstance(urls, list) or not urls:
            return None
        return payload

    def _collect_toolkit_inputs(self, option: str) -> Optional[Dict[str, object]]:
        payload: Dict[str, object] = {"option": option}
        if option == "2":
            fp = self._prompt_fallback_download()
            if fp is None:
                return None
            payload.update(fp)
        elif option in {"1", "3", "5"}:
            lines = self._prompt_urls("Paste one URL per line:")
            if lines is None:
                return None
            if not lines:
                QtWidgets.QMessageBox.warning(self, "Missing Input", "No URLs provided.")
                return None
            payload["urls"] = lines
            if option == "3":
                cookie_path, _ = QtWidgets.QFileDialog.getOpenFileName(
                    self,
                    "Select cookies.txt (optional)",
                    str(self.base_dir),
                    "Text files (*.txt *.cookies);;All files (*.*)",
                )
                if cookie_path:
                    payload["cookies"] = cookie_path
        elif option == "4":
            forced = self._forced_tiktok_mode
            self._forced_tiktok_mode = None
            if forced in {"1", "2", "3"}:
                mode = forced
            else:
                mode_items = ["Normal TikTok URL Queue", "Sound URL Batch", "TikTok URL Queue -> MP3"]
                mode_label, ok = QtWidgets.QInputDialog.getItem(self, "TikTok Mode", "Choose mode:", mode_items, 0, False)
                if not ok:
                    return None
                mode = "1" if mode_label == mode_items[0] else "2" if mode_label == mode_items[1] else "3"
            payload["mode"] = mode
            if mode == "2":
                sound_url, ok_url = QtWidgets.QInputDialog.getText(self, "Sound URL", "Paste TikTok sound URL:")
                if not ok_url or not sound_url.strip():
                    return None
                count, ok_count = QtWidgets.QInputDialog.getInt(
                    self, "Batch Size", "How many videos from this sound?", 20, 1, 200, 1
                )
                if not ok_count:
                    return None
                payload["urls"] = [sound_url.strip()]
                payload["count"] = count
            else:
                lines = self._prompt_urls("Paste one TikTok URL per line:")
                if lines is None:
                    return None
                if not lines:
                    QtWidgets.QMessageBox.warning(self, "Missing Input", "No URLs provided.")
                    return None
                payload["urls"] = lines
        elif option in {"7", "13", "14", "15"}:
            files, _ = QtWidgets.QFileDialog.getOpenFileNames(
                self,
                "Select local media/audio files",
                str(self.base_dir),
                "Media files (*.mp3 *.wav *.m4a *.aac *.flac *.ogg *.mp4 *.mov *.mkv);;All files (*.*)",
            )
            if not files:
                return None
            payload["files"] = files
        elif option == "6":
            audio, _ = QtWidgets.QFileDialog.getOpenFileName(
                self,
                "Select audio file",
                str(self.base_dir),
                "Audio files (*.mp3 *.wav *.m4a *.aac *.flac *.ogg);;All files (*.*)",
            )
            if not audio:
                return None
            image, _ = QtWidgets.QFileDialog.getOpenFileName(
                self,
                "Select image file",
                str(self.base_dir),
                "Image files (*.jpg *.jpeg *.png *.webp *.bmp);;All files (*.*)",
            )
            if not image:
                return None
            payload["one_files"] = [audio, image]
        return payload

    def _ps_quote(self, value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    def _build_toolkit_command(self, script_dir: Path, option: str, fn_name: str, payload: Dict[str, object]) -> str:
        urls = payload.get("urls", [])
        files = payload.get("files", [])
        one_files = payload.get("one_files", [])
        one_file = payload.get("one_file")
        cookies = payload.get("cookies")
        mode = str(payload.get("mode", "1"))
        count = int(payload.get("count", 20))

        urls_ps = "@(" + ",".join(self._ps_quote(str(x)) for x in urls) + ")" if urls else "@()"
        files_ps = "@(" + ",".join(self._ps_quote(str(x)) for x in files) + ")" if files else "@()"
        one_files_ps = "@(" + ",".join(self._ps_quote(str(x)) for x in one_files) + ")" if one_files else "@()"
        one_file_ps = self._ps_quote(str(one_file)) if one_file else "''"
        cookies_ps = self._ps_quote(str(cookies)) if cookies else "''"

        return (
            "$ErrorActionPreference='Stop'; "
            "$env:DJ_TOOLKIT_RUN='0'; "
            "$env:NO_COLOR='1'; "
            "$PSStyle.OutputRendering='PlainText'; "
            f"Set-Location {self._ps_quote(str(script_dir))}; "
            ". .\\DJ_TOOLKIT_V2.ps1; "
            "$cfg=Load-Config; "
            "$cfg.UIProgressMode='Verbose'; "
            "$cfg.AutoOpenOutputFolder=$false; "
            f"$script:__gui_urls={urls_ps}; "
            f"$script:__gui_files={files_ps}; "
            f"$script:__gui_one_files={one_files_ps}; "
            f"$script:__gui_one={one_file_ps}; "
            f"$script:__gui_cookies={cookies_ps}; "
            "$script:__gui_url_index=0; "
            "$script:__gui_one_index=0; "
            f"$script:__gui_mode={self._ps_quote(mode)}; "
            f"$script:__gui_count={count}; "
            f"$script:__gui_option={self._ps_quote(option)}; "
            "function global:Banner { Write-Host '--- DJ Toolkit (GUI mode) ---' }; "
            "function global:Pause-User([string]$msg=''){ if($msg){Write-Host $msg} }; "
            "function global:Ask-YesNo([string]$prompt,[bool]$defaultYes=$true){ return $false }; "
            "function global:Read-Host([object]$Prompt){ "
            "$p=[string]$Prompt; "
            "if($p -match 'Choose mode'){ return $script:__gui_mode }; "
            "if($p -match 'How many videos from this sound'){ return [string]$script:__gui_count }; "
            "if($p -match '^Choose' -and $script:__gui_option -eq '4'){ return $script:__gui_mode }; "
            "return '' "
            "}; "
            "function global:Ask-Urls([string]$title=''){ return @($script:__gui_urls) }; "
            "function global:Read-UrlQueueOrBack { return @($script:__gui_urls) }; "
            "function global:Read-UrlOrBack { "
            "if($script:__gui_url_index -ge @($script:__gui_urls).Count){ return $null }; "
            "$u=$script:__gui_urls[$script:__gui_url_index]; $script:__gui_url_index++; return $u "
            "}; "
            "function global:Read-CookiesPathInputOrCancel([string]$prompt=''){ return $script:__gui_cookies }; "
            "function global:Pick-Files([string]$title,[string]$filter,[bool]$multi=$true,[string]$initialDir=''){ return @($script:__gui_files) }; "
            "function global:Pick-OneFile([string]$title,[string]$filter,[string]$initialDir=''){ "
            "if($title -match 'cookies'){ return $script:__gui_cookies }; "
            "if($script:__gui_one_index -lt @($script:__gui_one_files).Count){ $v=$script:__gui_one_files[$script:__gui_one_index]; $script:__gui_one_index++; return $v }; "
            "return $script:__gui_one "
            "}; "
            "function global:Write-Progress { param([string]$Activity,[string]$Status,[int]$PercentComplete=0,[switch]$Completed) if($Completed){ return } if($Status){ Write-Host ('[{0}%] {1} {2}' -f $PercentComplete,$Activity,$Status) } }; "
            f"{fn_name} $cfg"
        )

    def send_toolkit_input(self) -> None:
        self.lbl_status.setText("Direct input is disabled in status-panel mode.")

    def stop_toolkit_process(self) -> None:
        if self.toolkit_proc and self.toolkit_proc.poll() is None:
            try:
                self.toolkit_proc.terminate()
                self.toolkit_proc.wait(timeout=2.0)
            except Exception:
                try:
                    self.toolkit_proc.kill()
                except Exception:
                    pass
            self._set_toolkit_state("Error")
            self._set_toolkit_running_ui(False)
            self.lbl_toolkit_result.setText("Task stopped by user.")
            self.lbl_toolkit_eta.setText("--")
            self.lbl_status.setText("Toolkit process stopped.")
            self._emit_web_status(immediate=True)

    def _switch_toolkit_to_native(self) -> None:
        self._switch_toolkit_to_web()
        self.lbl_status.setVisible(True)
        self.lbl_status.setText("Classic workflow is disabled. Staying on new UI.")

    def _switch_toolkit_to_web(self) -> None:
        if hasattr(self, "_toolkit_stack"):
            self._toolkit_stack.setCurrentIndex(0)
        if hasattr(self, "header_widget"):
            self.header_widget.setVisible(False)
        if hasattr(self, "root_layout"):
            self.root_layout.setContentsMargins(0, 0, 0, 0)
            self.root_layout.setSpacing(0)
        self.status_rail.setVisible(False)
        self.lbl_status.setVisible(False)
        if hasattr(self, "left_nav_card"):
            self.left_nav_card.setVisible(False)

    def pick_output_folder(self, key: str, current_path: str = "") -> str:
        # Bring window to front so native dialog is visible; do NOT switch UI
        self.raise_()
        self.activateWindow()
        QtCore.QCoreApplication.processEvents()
        start_dir = current_path.strip() if current_path and Path(current_path).exists() else str(self.base_dir)
        title = "Select MP3 output folder" if key == "mp3" else "Select MP4 output folder"
        selected = QtWidgets.QFileDialog.getExistingDirectory(self, title, start_dir)
        if not selected:
            return ""
        if key == "mp3":
            self.config["mp3_output_path"] = selected
        else:
            self.config["mp4_output_path"] = selected
        try:
            self._persist_app_config()
        except Exception:
            pass
        self.lbl_status.setText(f"Selected {key.upper()} output folder: {selected}")
        self._emit_web_status(immediate=True)
        return selected

    def pick_files_for_mode(self, mode: str) -> List[str]:
        mode_l = str(mode or "").strip().lower()
        now_ts = time.time()
        # Guard against immediate duplicate picker calls from mixed frontend bridge paths.
        if (
            self._last_picker_files
            and self._last_picker_mode == mode_l
            and (now_ts - float(self._last_picker_ts or 0.0)) < 1.5
        ):
            cached = list(self._last_picker_files)
            try:
                dbg = self.base_dir / "Backups" / "picker_debug.log"
                dbg.parent.mkdir(parents=True, exist_ok=True)
                with dbg.open("a", encoding="utf-8") as fh:
                    fh.write(
                        f"{datetime.now().isoformat()} pick_files_for_mode mode={mode_l or 'any'} cached=True selected={len(cached)}\n"
                    )
            except Exception:
                pass
            return cached
        if mode_l == "audio":
            title = "Select audio files for MP4 batch"
            flt = "Audio files (*.mp3 *.wav *.m4a *.aac *.flac *.ogg);;All files (*.*)"
        elif mode_l == "video":
            title = "Select video files for concatenation"
            flt = "Video files (*.mp4 *.mov *.mkv *.webm);;All files (*.*)"
        else:
            title = "Select files"
            flt = "All files (*.*)"

        self.raise_()
        self.activateWindow()
        QtCore.QCoreApplication.processEvents()
        dlg = QtWidgets.QFileDialog(self, title)
        dlg.setFileMode(QtWidgets.QFileDialog.ExistingFiles)
        dlg.setNameFilter(flt)
        dlg.setOption(QtWidgets.QFileDialog.DontUseNativeDialog, False)
        accepted = dlg.exec() == QtWidgets.QDialog.Accepted
        if not accepted:
            print(f"pick_files_for_mode mode={mode_l or 'any'} accepted=False selected=0")
            try:
                dbg = self.base_dir / "Backups" / "picker_debug.log"
                dbg.parent.mkdir(parents=True, exist_ok=True)
                with dbg.open("a", encoding="utf-8") as fh:
                    fh.write(f"{datetime.now().isoformat()} pick_files_for_mode mode={mode_l or 'any'} accepted=False selected=0\n")
            except Exception:
                pass
            return []
        selected = [str(x) for x in dlg.selectedFiles() if str(x).strip()]
        self._last_picker_mode = mode_l
        self._last_picker_files = list(selected)
        self._last_picker_ts = time.time()
        print(f"pick_files_for_mode mode={mode_l or 'any'} accepted=True selected={len(selected)}")
        try:
            dbg = self.base_dir / "Backups" / "picker_debug.log"
            dbg.parent.mkdir(parents=True, exist_ok=True)
            with dbg.open("a", encoding="utf-8") as fh:
                fh.write(f"{datetime.now().isoformat()} pick_files_for_mode mode={mode_l or 'any'} accepted=True selected={len(selected)}\n")
                for s in selected[:5]:
                    fh.write(f"  file={s}\n")
        except Exception:
            pass
        return selected

    def show_old_files_dialog(self) -> None:
        QtWidgets.QMessageBox.information(self, "Not Yet", "Old-files dialog will be migrated next.")

    def refresh_stats(self) -> None:
        s = self.db.stats()
        total = s["total"]
        blocked = s["blocked"]
        pct = (blocked / total * 100) if total else 0
        self.s_block.setText(f"Blocked {blocked} ({pct:.1f}%)")
        self.s_claim.setText(f"Claimed {s['claimed']}")
        self.s_clean.setText(f"No Claim {s['no_claim']}")
        self.s_total.setText(f"Total Tested {total}")
        self.s_risk.setText(f"Estimated Block Risk {pct:.1f}%")

    def closeEvent(self, event: QtGui.QCloseEvent) -> None:
        if self.toolkit_proc and self.toolkit_proc.poll() is None:
            self.toolkit_proc.terminate()
        if self._vite_proc and self._vite_proc.poll() is None:
            self._vite_proc.terminate()
        if self.scan_worker and self.scan_worker.isRunning():
            self.scan_worker.terminate()
            self.scan_worker.wait(1000)
        self.db.close()
        super().closeEvent(event)


def main() -> int:
    install_runtime_error_hooks()
    QtCore.QCoreApplication.setAttribute(QtCore.Qt.AA_UseDesktopOpenGL, True)
    QtCore.QCoreApplication.setAttribute(QtCore.Qt.AA_DontCreateNativeWidgetSiblings, True)
    app = QtWidgets.QApplication(sys.argv)
    app.setStyle("Fusion")
    w = MainWindow()
    w.showMaximized()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())





