# Builds the World State JSON document that represents everything currently
# visible on screen. Calls both uia.py and win32.py to combine their views:
# - Iterates top-level windows from UIA
# - Enriches each window with Win32 metadata (HWND, process name, geometry)
# - Walks element trees up to depth 5 per window
# - Serializes the result into the 5.1 schema JSON structure
# - Enforces the <200ms latency target by capping tree depth and bailing
#   early on unresponsive windows
#
# This is the primary data source the LLM sees when it needs to understand
# screen state.
