# Wraps the Windows UI Automation API. Responsible for:
# - Enumerating all top-level windows
# - Walking an element tree from a root element down to a configurable depth
# - Reading element properties: role (button, edit, list, etc.), name, value,
#   bounding rectangle, enabled/focused state
# - Restricting tree walks to depth 5 to avoid snapshot blowup on complex apps
# - Gracefully failing on non-UIA apps (returning empty/null rather than crashing)
#
# This file knows nothing about Win32 — it only speaks UIA.
import uiautomation as auto

from common import get_process_name


def get_top_level_windows() -> list[dict]:
    """Return a snapshot of every top-level window visible to UIA.

    Walks the direct children of the UIA virtual desktop root. Each child is a
    top-level window; children that are stale or inaccessible are silently
    skipped so that one unresponsive app cannot stall the full snapshot.

    Returns a list of dicts in the same shape as win32.get_window_info(),
    with an additional "source" key set to "uiautomation".
    """
    top_level_windows = []

    # The root element represents the virtual Windows desktop; its direct
    # children are all top-level windows currently managed by the shell.
    root = auto.GetRootControl()

    for window in root.GetChildren():
        info = get_window_info(window)
        if info is not None:
            top_level_windows.append(info)

    return top_level_windows


def get_window_info(window: auto.Control) -> dict | None:
    """Extract a standard window snapshot dict from a single UIA Control.

    Mirrors the exact shape of win32.get_window_info() so that snapshot.py
    can merge or compare records from both backends without special-casing:
        hwnd, title, rect {x, y, width, height}, pid, process_name, visible, source

    NativeWindowHandle is 0 for UIA-only elements that have no underlying
    HWND (e.g. XAML Islands); those are stored as None to signal "no HWND".

    IsOffscreen is the UIA analogue of Win32's IsWindowVisible — it is True
    when the element exists in the tree but is not rendered on screen.

    Returns None when the element is stale, the COM call raises, or the
    bounding rectangle is unavailable — callers should simply skip None entries.
    """
    try:
        # BoundingRectangle is a RECT namedtuple: (left, top, right, bottom).
        rect = window.BoundingRectangle

        pid = window.ProcessId

        # NativeWindowHandle gives the underlying Win32 HWND when one exists.
        # Pure UIA elements (e.g. WinUI 3 islands) return 0.
        hwnd = window.NativeWindowHandle

        return {
            "hwnd": hwnd if hwnd else None,
            "title": window.Name,
            "rect": {
                "x": rect.left,
                "y": rect.top,
                "width": rect.right - rect.left,
                "height": rect.bottom - rect.top,
            },
            "pid": pid,
            "process_name": get_process_name(pid),
            # Negate IsOffscreen to match Win32's IsWindowVisible semantics:
            # True  → window is rendered and occupies screen space
            # False → window is in the tree but not currently visible
            "visible": not window.IsOffscreen,
            # Identifies which backend produced this record so callers can
            # distinguish UIA-enumerated windows from Win32-enumerated ones.
            "source": "uiautomation",
        }

    except Exception:
        # Stale element references, COM access-denied errors, and transient
        # shell windows all raise different exception types from the COM layer.
        # Return None so get_top_level_windows() can skip them cleanly.
        return None

def _walk_tree(control: auto.Control, depth: int, max_depth: int) -> dict | None:
    """Recursively build a nested snapshot of the UIA element tree.

    depth     — how deep we currently are (0 = the root window itself).
    max_depth — hard ceiling; we stop expanding children at this level.

    Each call handles exactly one node: snapshot it, then fan out to all its
    children before returning. This means every sibling is visited — the
    recursive call is inside the loop but the return is outside it, so the
    loop always runs to completion before the node is returned.

    Returns a get_window_info() dict with an extra "children" key, or None if
    the control is inaccessible so the caller can drop it cleanly.
    """
    # Base case: depth limit reached — return without descending further.
    if depth >= max_depth:
        return None

    # Snapshot this node; None means the element is stale or access-denied.
    node = get_window_info(control)
    if node is None:
        return None

    # Visit every child at depth+1. The return is intentionally outside this
    # loop — placing it inside would exit after the first child, leaving all
    # siblings unvisited.
    children = []
    for child in control.GetChildren():
        child_node = _walk_tree(child, depth + 1, max_depth)
        if child_node is not None:
            children.append(child_node)

    node["children"] = children
    return node


def get_windows_from_pid(target_pid: int) -> list[dict]:
    """Return window info for all top-level windows owned by target_pid.

    Filters the full UIA top-level snapshot to those whose ProcessId matches.
    Mirrors win32.get_windows_from_pid() but uses the UIA enumeration path,
    so it will also surface UIA-only windows that have no HWND.
    """
    return [w for w in get_top_level_windows() if w["pid"] == target_pid]


def get_all_visible_windows() -> list[dict]:
    """Return info for every visible, titled top-level window.

    Mirrors win32.get_all_visible_windows() — the primary discovery tool for
    agents. Filters out offscreen elements and untitled shell components
    (trays, IME hosts, tooltip anchors) that have no interactive surface.
    """
    # Keep only windows that are on-screen and carry a non-empty title.
    return [w for w in get_top_level_windows() if w["visible"] and w["title"]]


def find_window_by_title(title: str, exact: bool = False) -> list[dict]:
    """Return top-level windows whose title matches title.

    exact=False (default) — case-insensitive substring match, useful when the
        full title is unknown (e.g. "Notepad" matches "Untitled - Notepad").
    exact=True — full string equality, useful when multiple windows share a
        common substring and you need a specific one.

    UIA's native Name condition is used for the exact case; substring matching
    is done in Python over the already-snapshotted top-level list to avoid
    issuing a separate COM search.
    Returns an empty list rather than raising when no match is found.
    """
    if exact:
        # Use a UIA Name condition scoped to depth=1 (direct desktop children)
        # so we don't walk the entire element tree just to match by title.
        control = auto.WindowControl(searchDepth=1, Name=title)
        if not control.Exists(0, 0):
            return []
        info = get_window_info(control)
        return [info] if info is not None else []

    # Substring path: filter the already-enumerated snapshot in Python.
    title_lower = title.lower()
    return [w for w in get_top_level_windows() if title_lower in (w["title"] or "").lower()]


def set_focus(hwnd: int) -> dict:
    """Give keyboard focus to the window identified by hwnd via UIA SetFocus.

    Returns a confirmation dict so the agent knows the action completed and
    does not repeat it. UIA's SetFocus works through the automation interface
    rather than the raw Win32 SetForegroundWindow syscall, making it more
    reliable for UIA-native apps (WinUI 3, WPF) where SetForegroundWindow can
    be silently ignored. Raises RuntimeError if the handle is stale or focus
    is denied.
    """
    control = auto.ControlFromHandle(hwnd)
    if control is None:
        raise RuntimeError(f"Could not acquire UIA control for hwnd={hwnd}")

    try:
        control.SetFocus()
        return {
            "ok": True,
            "hwnd": hwnd,
            "title": control.Name,
        }
    except Exception as e:
        raise RuntimeError(f"Could not set focus on hwnd={hwnd}: {e}") from e


def get_element_tree(hwnd: int, max_depth: int = 5) -> dict | None:
    """Walk the UIA element tree rooted at the window identified by hwnd.

    Re-acquires the UIA control from the Win32 handle so callers only need
    to pass the serializable integer — no live COM object crosses the boundary.
    Returns None if the handle is stale or UIA cannot reach the window.
    """
    # ControlFromHandle re-acquires the live COM object from the HWND integer
    # that the agent passed over the JSON boundary.
    control = auto.ControlFromHandle(hwnd)
    if control is None:
        return None

    return _walk_tree(control, depth=0, max_depth=max_depth)