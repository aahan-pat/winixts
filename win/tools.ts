// Thin wrappers that expose a clean, typed action API to the rest of the
// TypeScript codebase. Each function maps one-to-one to a Win32 or UIA
// capability:
// - click(x, y)          — sends a mouse click at screen coordinates
// - typeText(text)        — sends a string as synthetic keystrokes
// - focusWindow(title)    — brings a window to the foreground
// - findElement(role, name) — locates a UIA element by role and name
//
// These functions call bridge.ts and handle translating JS-friendly arguments
// into the JSON format win_agent.py expects. They are what the LLM tool-call
// dispatcher ultimately invokes.
