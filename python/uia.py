# Wraps the Windows UI Automation API. Responsible for:
# - Enumerating all top-level windows
# - Walking an element tree from a root element down to a configurable depth
# - Reading element properties: role (button, edit, list, etc.), name, value,
#   bounding rectangle, enabled/focused state
# - Restricting tree walks to depth 5 to avoid snapshot blowup on complex apps
# - Gracefully failing on non-UIA apps (returning empty/null rather than crashing)
#
# This file knows nothing about Win32 — it only speaks UIA.
