import { tool } from "../core/tool.js";
import type { Bridge } from "./bridge.js";

// ---------------------------------------------------------------------------
// Typed return shapes (mirror the Python dict structures)
// ---------------------------------------------------------------------------

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface WindowInfo {
    hwnd: number | null;
    title: string;
    rect: Rect;
    pid: number;
    process_name: string | null;
    visible: boolean;
    source: "win32" | "uiautomation";
}

export interface ElementNode extends WindowInfo {
    children: ElementNode[];
}

export interface FocusResult {
    ok: boolean;
    hwnd: number;
    title: string;
}

export interface LaunchResult {
    ok: boolean;
    pid: number;
    path: string;
}

export interface CommandResult {
    ok: boolean;
    returncode: number;
    stdout: string;
    stderr: string;
}

// ---------------------------------------------------------------------------
// Tool implementations — each static method is auto-registered by @tool.
// The registry entry and schema live together; no separate TOOLS array needed.
// ---------------------------------------------------------------------------

export class WinTools {
    @tool({
        description:
            "Returns every visible, titled top-level window currently open on the desktop. " +
            "Use this first to discover what is on screen before taking any action.",
        params: {},
    })
    static getAllVisibleWindows(bridge: Bridge, _args: Record<string, unknown>): Promise<WindowInfo[]> {
        return bridge.call("uia.get_all_visible_windows") as Promise<WindowInfo[]>;
    }

    @tool({
        description:
            "Finds open windows whose title contains the given string. " +
            "Pass exact=true to require an exact title match.",
        params: {
            title: { type: "string", description: "The title (or substring) to search for." },
            exact: { type: "boolean", description: "If true, require an exact match. Default false." },
        },
        required: ["title"],
    })
    static findWindowByTitle(bridge: Bridge, args: Record<string, unknown>): Promise<WindowInfo[]> {
        return bridge.call("uia.find_window_by_title", {
            title: args["title"] as string,
            exact: args["exact"] as boolean | undefined,
        }) as Promise<WindowInfo[]>;
    }

    @tool({
        description:
            "Walks the UI element tree inside a window and returns it as a nested structure. " +
            "Use the hwnd from getAllVisibleWindows or findWindowByTitle.",
        params: {
            hwnd: { type: "number", description: "The Win32 window handle (hwnd) of the target window." },
            maxDepth: { type: "number", description: "How many levels deep to walk. Default 5." },
        },
        required: ["hwnd"],
    })
    static getElementTree(bridge: Bridge, args: Record<string, unknown>): Promise<ElementNode | null> {
        return bridge.call("uia.get_element_tree", {
            hwnd: args["hwnd"] as number,
            max_depth: (args["maxDepth"] as number | undefined) ?? 5,
        }) as Promise<ElementNode | null>;
    }

    @tool({
        description: "Brings the window identified by hwnd to the foreground and gives it keyboard focus.",
        params: {
            hwnd: { type: "number", description: "The Win32 window handle (hwnd) of the target window." },
        },
        required: ["hwnd"],
    })
    static setFocus(bridge: Bridge, args: Record<string, unknown>): Promise<FocusResult> {
        return bridge.call("uia.set_focus", { hwnd: args["hwnd"] as number }) as Promise<FocusResult>;
    }

    @tool({
        description: "Returns geometry and process identity for a single window by its hwnd.",
        params: {
            hwnd: { type: "number", description: "The Win32 window handle (hwnd) of the window." },
        },
        required: ["hwnd"],
    })
    static getWindowInfo(bridge: Bridge, args: Record<string, unknown>): Promise<WindowInfo> {
        return bridge.call("win32.get_window_info", { hwnd: args["hwnd"] as number }) as Promise<WindowInfo>;
    }

    @tool({
        description:
            "Launches an application by executable name or full path. " +
            "Returns the PID of the new process. The app is spawned detached — " +
            "this returns immediately without waiting for the window to appear. " +
            "Use getAllVisibleWindows after a short delay to confirm it opened.",
        params: {
            path: {
                type: "string",
                description: "Executable name (e.g. 'notepad.exe') or absolute path.",
            },
        },
        required: ["path"],
    })
    static launchApp(bridge: Bridge, args: Record<string, unknown>): Promise<LaunchResult> {
        return bridge.call("win32.launch_app", { path: args["path"] as string }) as Promise<LaunchResult>;
    }

    @tool({
        description:
            "Runs a shell command and returns its stdout, stderr, and exit code. " +
            "Executes via cmd.exe so built-ins, pipes, and environment variables all work. " +
            "Blocks until the command exits or the timeout is reached.",
        params: {
            command: { type: "string", description: "The shell command to execute." },
            timeout: { type: "number", description: "Timeout in seconds. Default 30." },
        },
        required: ["command"],
    })
    static runCommand(bridge: Bridge, args: Record<string, unknown>): Promise<CommandResult> {
        return bridge.call("win32.run_command", {
            command: args["command"] as string,
            ...(args["timeout"] !== undefined ? { timeout: args["timeout"] as number } : {}),
        }) as Promise<CommandResult>;
    }
}
