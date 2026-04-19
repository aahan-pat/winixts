# Shared utilities used by both win32.py and uia.py.
# Only pure-Python helpers belong here — nothing that imports a backend-specific
# library (pywin32, uiautomation) so this module stays importable on any host.
import psutil


def get_process_name(pid: int) -> str | None:
    """Return the executable name for a PID, or None if the process is inaccessible."""
    try:
        return psutil.Process(pid).name()
    except psutil.NoSuchProcess:
        return None
