# Entry point and central dispatcher for the entire Python process.
# Owns the stdin/stdout loop — reading JSON requests from TypeScript, routing
# them to the correct module function, and writing JSON responses back.
# Also handles startup (importing dependencies, initializing COM for UIA)
# and teardown. Every capability Python exposes to TypeScript goes through
# this file's dispatch table.
