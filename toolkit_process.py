"""
Native toolkit process handle: subprocess-like interface with cancel support.
"""
import threading
import time
from typing import Callable, Optional


class NativeToolkitProcessHandle:
    """Mimics subprocess.Popen for native toolkit jobs; terminate() triggers cancel_cb."""

    def __init__(self, cancel_cb: Callable[[], None]) -> None:
        self._cancel_cb = cancel_cb
        self._returncode: Optional[int] = None
        self._lock = threading.Lock()

    def poll(self) -> Optional[int]:
        with self._lock:
            return self._returncode

    def set_returncode(self, code: int) -> None:
        with self._lock:
            self._returncode = code

    def terminate(self) -> None:
        self._cancel_cb()
        with self._lock:
            if self._returncode is None:
                self._returncode = 1

    def kill(self) -> None:
        self.terminate()

    def wait(self, timeout: Optional[float] = None) -> int:
        started = time.monotonic()
        while True:
            code = self.poll()
            if code is not None:
                return code
            if timeout is not None and (time.monotonic() - started) >= timeout:
                raise TimeoutError("Native toolkit job wait timed out.")
            time.sleep(0.05)
