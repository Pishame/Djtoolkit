"""
Reusable Qt widgets and dialogs for the DJ Production Suite.
"""
from pathlib import Path
from typing import Dict, List, Optional

from PySide6 import QtCore, QtGui, QtWidgets


class AnimatedButton(QtWidgets.QPushButton):
    def __init__(
        self,
        text: str,
        icon: Optional[QtGui.QIcon] = None,
        parent: Optional[QtWidgets.QWidget] = None,
        with_shadow: bool = True,
    ):
        super().__init__(text, parent)
        if icon is not None:
            self.setIcon(icon)
        self.setCursor(QtCore.Qt.PointingHandCursor)
        self.setMinimumHeight(40)
        self._with_shadow = with_shadow

        self._shadow: Optional[QtWidgets.QGraphicsDropShadowEffect] = None
        self._anim: Optional[QtCore.QPropertyAnimation] = None
        if self._with_shadow:
            self._shadow = QtWidgets.QGraphicsDropShadowEffect(self)
            self._shadow.setBlurRadius(5.0)
            self._shadow.setOffset(0, 1)
            self._shadow.setColor(QtGui.QColor(0, 0, 0, 55))
            self.setGraphicsEffect(self._shadow)
            self._anim = QtCore.QPropertyAnimation(self._shadow, b"blurRadius", self)
            self._anim.setDuration(150)
            self._anim.setEasingCurve(QtCore.QEasingCurve.OutCubic)

    def enterEvent(self, event: QtCore.QEvent) -> None:
        if self._with_shadow and self._anim and self._shadow:
            self._anim.stop()
            self._anim.setStartValue(self._shadow.blurRadius())
            self._anim.setEndValue(8.0)
            self._anim.start()
        super().enterEvent(event)

    def leaveEvent(self, event: QtCore.QEvent) -> None:
        if self._with_shadow and self._anim and self._shadow:
            self._anim.stop()
            self._anim.setStartValue(self._shadow.blurRadius())
            self._anim.setEndValue(5.0)
            self._anim.start()
        super().leaveEvent(event)


class SmoothScrollArea(QtWidgets.QScrollArea):
    def __init__(self, parent: Optional[QtWidgets.QWidget] = None) -> None:
        super().__init__(parent)
        self._scroll_anim = QtCore.QPropertyAnimation(self.verticalScrollBar(), b"value", self)
        self._scroll_anim.setDuration(220)
        self._scroll_anim.setEasingCurve(QtCore.QEasingCurve.OutCubic)

    def wheelEvent(self, event: QtGui.QWheelEvent) -> None:
        bar = self.verticalScrollBar()
        if bar.maximum() <= 0:
            super().wheelEvent(event)
            return
        delta = event.angleDelta().y()
        if delta == 0:
            super().wheelEvent(event)
            return
        step = int(delta / 120) * 72
        current = bar.value()
        target = max(bar.minimum(), min(bar.maximum(), current - step))
        self._scroll_anim.stop()
        self._scroll_anim.setStartValue(current)
        self._scroll_anim.setEndValue(target)
        self._scroll_anim.start()
        event.accept()


class UrlInputDialog(QtWidgets.QDialog):
    def __init__(self, parent: Optional[QtWidgets.QWidget] = None, helper: str = "Paste one URL per line:") -> None:
        super().__init__(parent)
        self.setModal(True)
        self.setWindowFlags(QtCore.Qt.Dialog | QtCore.Qt.FramelessWindowHint)
        self.setAttribute(QtCore.Qt.WA_TranslucentBackground, True)
        self.resize(640, 360)

        root = QtWidgets.QVBoxLayout(self)
        root.setContentsMargins(16, 16, 16, 16)
        root.setSpacing(0)

        card = QtWidgets.QFrame()
        card.setObjectName("UrlModalCard")
        card.setStyleSheet(
            """
            QFrame#UrlModalCard {
                background: qlineargradient(x1:0,y1:0,x2:1,y2:1, stop:0 rgba(29, 33, 70, 245), stop:1 rgba(26, 21, 56, 245));
                border: 1px solid rgba(174, 118, 255, 0.60);
                border-radius: 16px;
            }
            QLabel#UrlTitle { font-size: 32px; font-weight: 700; color: #f3e9ff; }
            QLabel#UrlHelp { font-size: 14px; color: #c3b8ea; }
            QTextEdit#UrlText {
                border: 1px solid rgba(142, 122, 226, 0.45);
                border-radius: 12px;
                background: rgba(19, 21, 50, 0.82);
                color: #ecf1ff;
                padding: 10px;
                font-size: 15px;
            }
            QTextEdit#UrlText:focus {
                border: 1px solid rgba(206, 98, 255, 0.95);
                background: rgba(22, 25, 59, 0.90);
            }
            QPushButton#UrlPrimary {
                background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #f04996, stop:1 #6b49ff);
                border: 0px;
                border-radius: 10px;
                color: #ffffff;
                min-height: 40px;
                font-weight: 700;
                padding: 8px 14px;
            }
            QPushButton#UrlGhost {
                background: transparent;
                border: 1px solid rgba(146, 128, 214, 0.45);
                border-radius: 10px;
                color: #cfc7ef;
                min-height: 40px;
                font-weight: 600;
                padding: 8px 14px;
            }
            QPushButton#UrlClose {
                background: transparent;
                border: 0px;
                color: #d8caee;
                min-width: 28px;
                min-height: 28px;
                font-size: 20px;
            }
            QPushButton#UrlClose:hover { color: #ffffff; }
            """
        )
        card_shadow = QtWidgets.QGraphicsDropShadowEffect(card)
        card_shadow.setBlurRadius(28.0)
        card_shadow.setOffset(0, 8)
        card_shadow.setColor(QtGui.QColor(35, 8, 72, 200))
        card.setGraphicsEffect(card_shadow)
        root.addWidget(card)

        layout = QtWidgets.QVBoxLayout(card)
        layout.setContentsMargins(20, 16, 20, 16)
        layout.setSpacing(12)

        header = QtWidgets.QHBoxLayout()
        title = QtWidgets.QLabel("🎵 Add Download URLs")
        title.setObjectName("UrlTitle")
        btn_close = QtWidgets.QPushButton("×")
        btn_close.setObjectName("UrlClose")
        btn_close.clicked.connect(self.reject)
        header.addWidget(title)
        header.addStretch(1)
        header.addWidget(btn_close)
        layout.addLayout(header)

        line = QtWidgets.QFrame()
        line.setFrameShape(QtWidgets.QFrame.HLine)
        line.setStyleSheet("background: rgba(179, 138, 255, 0.22); max-height: 1px;")
        layout.addWidget(line)

        lbl_help = QtWidgets.QLabel(helper)
        lbl_help.setObjectName("UrlHelp")
        layout.addWidget(lbl_help)

        self.text = QtWidgets.QTextEdit()
        self.text.setObjectName("UrlText")
        self.text.setPlaceholderText("Paste YouTube, TikTok, or direct video links here...")
        layout.addWidget(self.text, 1)

        self.lbl_error = QtWidgets.QLabel("")
        self.lbl_error.setStyleSheet("color:#ff9cb5;font-size:12px;")
        layout.addWidget(self.lbl_error)

        actions = QtWidgets.QHBoxLayout()
        self.btn_ok = QtWidgets.QPushButton("Start Download")
        self.btn_ok.setObjectName("UrlPrimary")
        self.btn_cancel = QtWidgets.QPushButton("Cancel")
        self.btn_cancel.setObjectName("UrlGhost")
        self.btn_ok.clicked.connect(self._on_accept)
        self.btn_cancel.clicked.connect(self.reject)
        actions.addWidget(self.btn_ok)
        actions.addWidget(self.btn_cancel)
        layout.addLayout(actions)

    def _on_accept(self) -> None:
        lines = self.urls()
        if not lines:
            self.lbl_error.setText("Add at least one valid URL line.")
            return
        self.accept()

    def urls(self) -> List[str]:
        return [x.strip() for x in self.text.toPlainText().splitlines() if x.strip()]


class FallbackDownloadDialog(QtWidgets.QDialog):
    def __init__(self, parent: Optional[QtWidgets.QWidget] = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Fallback Download")
        self.setModal(True)
        self.resize(980, 700)
        self.setStyleSheet(
            """
            QDialog { background:#0b0c11; color:#e9edf8; }
            QFrame#FallbackCard { background:#111319; border:1px solid #252a38; border-radius:16px; }
            QFrame#ActivityCard { background:#17191f; border:1px solid #2b3040; border-radius:12px; }
            QLabel#FallbackTitle { font-size:28px; font-weight:700; color:#f4f7ff; }
            QLabel#FallbackLabel { font-size:13px; color:#9fb0d6; font-weight:600; }
            QLineEdit, QComboBox { background:#1a1d25; border:1px solid #343a4a; border-radius:10px; min-height:38px; padding:0 10px; color:#edf2ff; }
            QLineEdit:focus, QComboBox:focus { border:1px solid #ff3e9e; }
            QPushButton#FallbackPrimary {
                background:#ff0a88;
                border:1px solid #ff45ad;
                border-radius:12px;
                min-height:48px;
                font-size:20px;
                font-weight:800;
                color:#ffffff;
            }
            QPushButton#FallbackPrimary:hover { background:#ff1f97; }
            QPushButton#FallbackGhost {
                background:#1d212b;
                border:1px solid #3a4154;
                border-radius:10px;
                min-height:38px;
                color:#d8dff4;
                font-weight:600;
            }
            QCheckBox { spacing:10px; color:#e5ebfa; font-size:14px; }
            QCheckBox::indicator {
                width:18px; height:18px; border-radius:9px; border:1px solid #4a536a; background:#232a3a;
            }
            QCheckBox::indicator:checked { background:#ff0a88; border:1px solid #ff5db5; }
            QListWidget { background:#171b24; border:1px solid #2f374a; border-radius:10px; padding:8px; }
            QListWidget::item { padding:8px; border-radius:8px; }
            QListWidget::item:selected { background:#2b3150; }
            """
        )
        root = QtWidgets.QHBoxLayout(self)
        root.setContentsMargins(16, 14, 16, 16)
        root.setSpacing(14)

        card = QtWidgets.QFrame()
        card.setObjectName("FallbackCard")
        left = QtWidgets.QVBoxLayout(card)
        left.setContentsMargins(18, 14, 18, 18)
        left.setSpacing(12)
        title = QtWidgets.QLabel("Download Audio")
        title.setObjectName("FallbackTitle")
        left.addWidget(title)

        left.addWidget(self._label("Source URL"))
        url_row = QtWidgets.QHBoxLayout()
        self.url_edit = QtWidgets.QLineEdit()
        self.url_edit.setPlaceholderText("https://youtube.com/watch?v=...")
        btn_paste = QtWidgets.QPushButton("Paste")
        btn_paste.setObjectName("FallbackGhost")
        btn_paste.setMinimumWidth(108)
        btn_paste.clicked.connect(self._paste_clipboard)
        url_row.addWidget(self.url_edit, 1)
        url_row.addWidget(btn_paste)
        left.addLayout(url_row)

        left.addWidget(self._label("Quality / Bitrate"))
        self.quality_combo = QtWidgets.QComboBox()
        self.quality_combo.addItems(["320 kbps (Recommended)", "256 kbps", "192 kbps", "160 kbps", "128 kbps"])
        left.addWidget(self.quality_combo)

        opts = QtWidgets.QFrame()
        opts.setObjectName("ActivityCard")
        opts_l = QtWidgets.QVBoxLayout(opts)
        opts_l.setContentsMargins(12, 12, 12, 12)
        opts_l.setSpacing(8)
        self.chk_meta = QtWidgets.QCheckBox("Auto-tag Metadata")
        self.chk_meta.setChecked(True)
        self.chk_thumb = QtWidgets.QCheckBox("Download Thumbnail")
        self.chk_thumb.setChecked(True)
        self.chk_lib = QtWidgets.QCheckBox("Add to Library")
        opts_l.addWidget(self.chk_meta)
        opts_l.addWidget(self.chk_thumb)
        opts_l.addWidget(self.chk_lib)
        left.addWidget(opts)

        left.addWidget(self._label("Save Destination"))
        dest_row = QtWidgets.QHBoxLayout()
        self.dest_edit = QtWidgets.QLineEdit(str(Path.home() / "Downloads" / "DJDownloads" / "MP4"))
        btn_browse = QtWidgets.QPushButton("Browse")
        btn_browse.setObjectName("FallbackGhost")
        btn_browse.setMinimumWidth(108)
        btn_browse.clicked.connect(self._browse_dest)
        dest_row.addWidget(self.dest_edit, 1)
        dest_row.addWidget(btn_browse)
        left.addLayout(dest_row)

        self.lbl_error = QtWidgets.QLabel("")
        self.lbl_error.setStyleSheet("color:#ff7aa8;font-size:12px;")
        left.addWidget(self.lbl_error)

        action_row = QtWidgets.QHBoxLayout()
        self.btn_start = QtWidgets.QPushButton("START DOWNLOAD")
        self.btn_start.setObjectName("FallbackPrimary")
        self.btn_start.clicked.connect(self._on_accept)
        self.btn_cancel = QtWidgets.QPushButton("Cancel")
        self.btn_cancel.setObjectName("FallbackGhost")
        self.btn_cancel.clicked.connect(self.reject)
        action_row.addWidget(self.btn_start, 1)
        action_row.addWidget(self.btn_cancel)
        left.addLayout(action_row)

        right_card = QtWidgets.QFrame()
        right_card.setObjectName("ActivityCard")
        right = QtWidgets.QVBoxLayout(right_card)
        right.setContentsMargins(12, 12, 12, 12)
        right.setSpacing(8)
        right.addWidget(self._label("ACTIVITY HUB"))
        self.activity = QtWidgets.QListWidget()
        self.activity.addItems(
            [
                "Completed: Midnight City - M83 (320kbps)",
                "Completed: Strobe - deadmau5 (WAV)",
                "Failed: Unknown Track - Link expired",
            ]
        )
        right.addWidget(self.activity, 1)
        b_clear = QtWidgets.QPushButton("Clear History")
        b_clear.setObjectName("FallbackGhost")
        b_clear.clicked.connect(self.activity.clear)
        right.addWidget(b_clear)

        root.addWidget(card, 3)
        root.addWidget(right_card, 1)

    def _label(self, text: str) -> QtWidgets.QLabel:
        lbl = QtWidgets.QLabel(text)
        lbl.setObjectName("FallbackLabel")
        return lbl

    def _paste_clipboard(self) -> None:
        txt = QtWidgets.QApplication.clipboard().text().strip()
        if txt:
            self.url_edit.setText(txt.splitlines()[0].strip())

    def _browse_dest(self) -> None:
        path = QtWidgets.QFileDialog.getExistingDirectory(self, "Select destination folder", self.dest_edit.text().strip())
        if path:
            self.dest_edit.setText(path)

    def _on_accept(self) -> None:
        if not self.url_edit.text().strip():
            self.lbl_error.setText("Paste a URL before starting.")
            return
        self.accept()

    def payload(self) -> Dict[str, object]:
        return {
            "urls": [self.url_edit.text().strip()],
            "quality": self.quality_combo.currentText(),
            "auto_tag": self.chk_meta.isChecked(),
            "download_thumbnail": self.chk_thumb.isChecked(),
            "add_to_library": self.chk_lib.isChecked(),
            "destination": self.dest_edit.text().strip(),
        }


class CommandPaletteDialog(QtWidgets.QDialog):
    def __init__(self, parent: QtWidgets.QWidget, actions: List[Dict[str, str]]) -> None:
        super().__init__(parent)
        self.setWindowTitle("Command Palette")
        self.setModal(True)
        self.resize(560, 420)
        self._actions = actions
        self.selected_action: Optional[Dict[str, str]] = None

        layout = QtWidgets.QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(8)

        self.search = QtWidgets.QLineEdit()
        self.search.setPlaceholderText("Type a command... (Ctrl+K)")
        layout.addWidget(self.search)

        self.list = QtWidgets.QListWidget()
        self.list.setUniformItemSizes(True)
        layout.addWidget(self.list, 1)
        self.search.textChanged.connect(self._refresh)
        self.search.returnPressed.connect(self._accept_current)
        self.list.itemDoubleClicked.connect(lambda _: self._accept_current())
        self.list.itemActivated.connect(lambda _: self._accept_current())
        self._refresh()

    def _refresh(self) -> None:
        q = self.search.text().strip().lower()
        self.list.clear()
        for action in self._actions:
            label = action["label"]
            if q and q not in label.lower():
                continue
            item = QtWidgets.QListWidgetItem(label)
            item.setData(QtCore.Qt.UserRole, action)
            self.list.addItem(item)
        if self.list.count() > 0:
            self.list.setCurrentRow(0)

    def _accept_current(self) -> None:
        item = self.list.currentItem()
        if not item:
            return
        self.selected_action = item.data(QtCore.Qt.UserRole)
        self.accept()
