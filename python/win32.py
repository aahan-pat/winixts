# Wraps the Win32 API via pywin32. Responsible for:
# - Finding windows by title or process ID (FindWindow, EnumWindows)
# - Bringing a window to the foreground (SetForegroundWindow)
# - Sending synthetic keyboard input (SendInput, keybd_event)
# - Sending synthetic mouse input — clicks, moves (mouse_event, SendInput)
# - Querying process start/stop state
# - Launching applications and running shell commands
#
# This file knows nothing about UIA element trees — it only speaks Win32
# handles (HWNDs) and raw input.
import subprocess
from datetime import datetime

import psutil
import pywintypes
import win32gui
import win32process

from common import get_process_name


def get_window_info(hwnd: int) -> dict:
    """Return a snapshot of geometry and identity for the given HWND.

    Returns a dict with keys: hwnd, title, rect (x/y/width/height), pid,
    process_name, and visible. rect is converted from Win32's
    (left, top, right, bottom) to origin + size.
    Raises RuntimeError if the HWND is invalid or stale.
    """
    try:
        title = win32gui.GetWindowText(hwnd)
        rect = win32gui.GetWindowRect(hwnd)  # (left, top, right, bottom)
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        visible = win32gui.IsWindowVisible(hwnd)
    except pywintypes.error as e:
        raise RuntimeError(f"Could not read window info (hwnd={hwnd}): {e.strerror}") from e

    return {
        "hwnd": hwnd,
        "title": title,
        "rect": {
            "x": rect[0],
            "y": rect[1],
            "width": rect[2] - rect[0],
            "height": rect[3] - rect[1],
        },
        "pid": pid,
        "process_name": get_process_name(pid),
        "visible": bool(visible),
        # Identifies which backend produced this record so callers can
        # distinguish Win32-enumerated windows from UIA-enumerated ones.
        "source": "win32",
    }

def get_process_info(pid: int) -> dict:
    """Return a snapshot of runtime state for the given PID.

    Useful for distinguishing between multiple instances of the same executable
    (e.g. several chrome.exe entries) via cmdline, username, or create_time.

    Fields that require elevated access (exe, cmdline, username) fall back to
    None rather than raising, so the dict is always fully populated.
    Raises RuntimeError if the PID does not exist or cannot be accessed at all.
    """
    try:
        p = psutil.Process(pid)

        # exe and cmdline are denied for some system/elevated processes
        try:
            exe = p.exe()
        except (psutil.AccessDenied, psutil.ZombieProcess):
            exe = None

        try:
            cmdline = p.cmdline()  # full argv — distinguishes instances of the same binary
        except (psutil.AccessDenied, psutil.ZombieProcess):
            cmdline = None

        try:
            username = p.username()  # domain\user on Windows
        except (psutil.AccessDenied, psutil.ZombieProcess):
            username = None

        mem = p.memory_info()

        return {
            "pid": pid,
            "name": p.name(),
            "exe": exe,
            "cmdline": cmdline,
            "status": p.status(),           # running | sleeping | stopped | zombie
            "username": username,
            "ppid": p.ppid(),
            "created": datetime.fromtimestamp(p.create_time()).isoformat(),
            "cpu_percent": p.cpu_percent(interval=0.1),
            "memory_mb": round(mem.rss / (1024 * 1024), 2),  # resident set size
            "num_threads": p.num_threads(),
        }

    except psutil.NoSuchProcess:
        raise RuntimeError(f"No process found with pid={pid}") from None
    except psutil.AccessDenied:
        raise RuntimeError(f"Permission denied reading process info for pid={pid}") from None



def get_windows_from_pid(target_pid: int) -> list[dict]:
    """Return window info for all visible top-level windows owned by target_pid.

    Uses EnumWindows to walk every top-level HWND, keeping only those whose
    owning process matches target_pid and that are currently visible.
    Raises RuntimeError if the enumeration itself fails.
    """
    hwnds = []

    def callback(hwnd, extra):
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        # Keep only visible windows belonging to the target process.
        if pid == target_pid and win32gui.IsWindowVisible(hwnd):
            hwnds.append(hwnd)

    try:
        win32gui.EnumWindows(callback, None)
    except pywintypes.error as e:
        raise RuntimeError(f"Could not enumerate windows for pid={target_pid}: {e.strerror}") from e

    return [get_window_info(hwnd) for hwnd in hwnds]

def get_all_windows() -> list[dict]:
    """Return info for every top-level window, visible or not.

    Includes background windows, shell trays, tooltips, and untitled windows.
    Each entry has the full get_window_info shape (hwnd, title, rect, pid,
    process_name, visible). Use get_all_visible_windows() instead when you
    only want windows a user can actually interact with.
    Raises RuntimeError if the enumeration fails.
    """
    hwnds = []

    try:
        win32gui.EnumWindows(lambda hwnd, _: hwnds.append(hwnd), None)
    except pywintypes.error as e:
        raise RuntimeError(f"Could not enumerate windows: {e.strerror}") from e

    return [get_window_info(hwnd) for hwnd in hwnds]


def get_all_visible_windows() -> list[dict]:
    """Return info for every visible, titled top-level window.

    This is the primary discovery tool for agents — call this first to find
    a window before using set_foreground_window or any HWND-based function.
    Filters out invisible windows and untitled background windows (shell
    components, IME hosts, tooltip anchors) that have no interactive surface.
    Raises RuntimeError if the enumeration fails.
    """
    hwnds = []

    def callback(hwnd, extra):
        if win32gui.IsWindowVisible(hwnd) and win32gui.GetWindowText(hwnd):
            hwnds.append(hwnd)

    try:
        win32gui.EnumWindows(callback, None)
    except pywintypes.error as e:
        raise RuntimeError(f"Could not enumerate windows: {e.strerror}") from e

    return [get_window_info(hwnd) for hwnd in hwnds]


def set_foreground_window(hwnd: int) -> dict:
    """Bring the window identified by hwnd to the foreground.

    Returns a confirmation dict so the agent knows the action completed and
    does not repeat it. Raises RuntimeError if the HWND is invalid, stale,
    or focus is denied (e.g. UAC elevation mismatch).
    """
    try:
        win32gui.SetForegroundWindow(hwnd)
        return {
            "ok": True,
            "hwnd": hwnd,
            "title": win32gui.GetWindowText(hwnd),
        }
    except pywintypes.error as e:
        raise RuntimeError(f"Could not focus window (hwnd={hwnd}): {e.strerror}") from e


def launch_app(path: str) -> dict:
    """Launch an executable and return its PID.

    path may be a bare executable name resolvable via PATH (e.g. "notepad.exe")
    or a full absolute path. The process is spawned detached — this call returns
    immediately without waiting for the app to finish loading.
    Raises RuntimeError if the executable is not found or access is denied.
    """
    try:
        proc = subprocess.Popen(path)
        return {"ok": True, "pid": proc.pid, "path": path}
    except FileNotFoundError:
        raise RuntimeError(f"Executable not found: {path}") from None
    except PermissionError:
        raise RuntimeError(f"Permission denied launching: {path}") from None
    except Exception as e:
        raise RuntimeError(f"Could not launch {path!r}: {e}") from e


def run_command(command: str, timeout: int = 30) -> dict:
    """Run a shell command and return its output.

    Executes via cmd.exe (shell=True) so built-ins like 'dir', 'echo', and
    piped expressions work as expected. Blocks until the command exits or the
    timeout expires. stdout and stderr are returned as stripped strings.
    Raises RuntimeError if the timeout is exceeded.
    """
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "ok": result.returncode == 0,
            "returncode": result.returncode,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
        }
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Command timed out after {timeout}s: {command}") from None
    except Exception as e:
        raise RuntimeError(f"Could not run command: {e}") from e


