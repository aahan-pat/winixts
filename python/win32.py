# Wraps the Win32 API via pywin32. Responsible for:
# - Finding windows by title or process ID (FindWindow, EnumWindows)
# - Bringing a window to the foreground (SetForegroundWindow)
# - Sending synthetic keyboard input (SendInput, keybd_event)
# - Sending synthetic mouse input — clicks, moves (mouse_event, SendInput)
# - Reading basic window geometry (GetWindowRect)
# - Querying process start/stop state
#
# This file knows nothing about UIA element trees — it only speaks Win32
# handles (HWNDs) and raw input.
import win32gui
import win32api
import win32process
from pprint import pprint

def get_window_info(hwnd: int) -> dict:
    title = win32gui.GetWindowText(hwnd)
    rect = win32gui.GetWindowRect(hwnd)  # (left, top, right, bottom)
    _, pid = win32process.GetWindowThreadProcessId(hwnd)
    visible = win32gui.IsWindowVisible(hwnd)

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
        "visible": bool(visible),
    }


def get_windows_from_pid(target_pid):
    hwnds = []

    def callback(hwnd, extra):
        _, pid = win32process.GetWindowThreadProcessId(hwnd)

        # Filter: match PID and visible windows
        if pid == target_pid and win32gui.IsWindowVisible(hwnd):
            hwnds.append(hwnd)

    win32gui.EnumWindows(callback, None)

    window_info = []
    for hwnd in hwnds:
        window_info.append(get_window_info(hwnd))

    return window_info


pprint(get_windows_from_pid(80396))