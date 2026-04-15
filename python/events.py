# Monitors OS-level events and emits structured notifications. Responsible for:
# - Detecting window focus changes (which window became active)
# - Detecting process start and stop events
# - Firing typed event objects within 100ms of the OS event occurring
# - Running in a background thread so it doesn't block the main dispatch
#   loop in win_agent.py
# - Pushing events to TypeScript proactively over stdout (as opposed to the
#   request/response pattern everything else uses)
