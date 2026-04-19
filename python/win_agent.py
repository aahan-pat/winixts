# Entry point and central dispatcher for the entire Python process.
# Owns the stdin/stdout loop — reading JSON requests from TypeScript, routing
# them to the correct module function, and writing JSON responses back.
# Also handles startup (importing dependencies, initializing COM for UIA)
# and teardown. Every capability Python exposes to TypeScript goes through
# this file's dispatch table.
import json
import sys
import threading

import uia
import win32
# import events  # uncomment once events.py is implemented

# Importing uiautomation initializes COM for the process automatically.
# All UIA calls must happen on the same thread that initialized COM, which is
# the main thread here — the stdin loop runs there, not in a worker.
import uiautomation  # noqa: F401  (side-effect import for COM init)

# Protects stdout so the background events thread and the main dispatch loop
# can both write responses without interleaving partial JSON lines.
_stdout_lock = threading.Lock()


def _write(response: dict) -> None:
    """Serialize response to JSON and write it as a single newline-terminated line.

    Thread-safe — both the main dispatch loop and the events background thread
    call this. The lock ensures one complete JSON object per write.
    """
    with _stdout_lock:
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()  # TypeScript is blocking on this line — never omit


# Dispatch table: maps the "method" string in each request to the Python
# function that handles it. Namespaced by backend ("uia.*" / "win32.*") so
# functions with the same logical name on both backends can coexist without
# collision. Adding a new capability means adding one line here — no if/elif
# chain to maintain.
DISPATCH = {
    # --- UIA backend ---
    # Enumeration
    "uia.get_top_level_windows":   uia.get_top_level_windows,    # params: none
    "uia.get_all_visible_windows": uia.get_all_visible_windows,  # params: none
    "uia.get_windows_from_pid":    uia.get_windows_from_pid,     # params: target_pid
    "uia.find_window_by_title":    uia.find_window_by_title,     # params: title, exact?
    # Element inspection
    "uia.get_window_info":         uia.get_window_info,          # params: (internal — takes Control, not exposed directly)
    "uia.get_element_tree":        uia.get_element_tree,         # params: hwnd, max_depth?
    # Focus
    "uia.set_focus":               uia.set_focus,                # params: hwnd

    # --- Win32 backend ---
    # Enumeration
    "win32.get_all_windows":          win32.get_all_windows,          # params: none
    "win32.get_all_visible_windows":  win32.get_all_visible_windows,  # params: none
    "win32.get_windows_from_pid":     win32.get_windows_from_pid,     # params: target_pid
    # Per-handle / per-process info
    "win32.get_window_info":          win32.get_window_info,          # params: hwnd
    "win32.get_process_info":         win32.get_process_info,         # params: pid
    # Focus and input
    "win32.set_foreground_window":    win32.set_foreground_window,    # params: hwnd
    # Launch and shell
    "win32.launch_app":               win32.launch_app,               # params: path
    "win32.run_command":              win32.run_command,              # params: command, timeout?
}


def _handle(line: str) -> None:
    """Parse one JSON request line, dispatch it, and write the response.

    Request shape:  {"id": <any>, "method": "<backend>.<fn>", "params": {...}}
    Response shape: {"id": <any>, "result": <return value>}
                    {"id": <any>, "error": "<message>"}

    params is spread as keyword arguments into the handler, so the keys must
    match the function's parameter names exactly.
    """
    # Parse — a malformed line should never crash the loop.
    try:
        request = json.loads(line)
    except json.JSONDecodeError as e:
        _write({"id": None, "error": f"Invalid JSON: {e}"})
        return

    req_id = request.get("id")
    method = request.get("method")
    params = request.get("params", {})

    handler = DISPATCH.get(method)
    if handler is None:
        _write({"id": req_id, "error": f"Unknown method: {method!r}"})
        return

    try:
        result = handler(**params)
        _write({"id": req_id, "result": result})
    except TypeError as e:
        # Mismatched params — wrong keys or missing required argument.
        _write({"id": req_id, "error": f"Bad params for {method!r}: {e}"})
    except RuntimeError as e:
        # Expected domain errors raised by win32/uia functions.
        _write({"id": req_id, "error": str(e)})
    except Exception as e:
        # Unexpected errors — surface them rather than silently dropping.
        _write({"id": req_id, "error": f"Unexpected error in {method!r}: {e}"})


def main() -> None:
    """Start the agent: spin up background threads, then enter the dispatch loop.

    The loop reads one line at a time from stdin. EOF (TypeScript closing the
    pipe) exits cleanly. Blank lines are skipped so stray newlines don't error.
    """
    # Start the events background thread once events.py is implemented.
    # It receives _write so it can push proactive notifications on the same
    # stdout channel without needing direct access to the lock.
    # events.start(_write)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        _handle(line)


if __name__ == "__main__":
    main()
