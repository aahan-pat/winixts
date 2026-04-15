// Manages the lifecycle of the Python subprocess and owns the communication
// channel. Responsible for:
// - Spawning python/win_agent.py as a child process on startup
// - Writing newline-delimited JSON requests to the process's stdin
// - Reading and parsing JSON responses from stdout
// - Matching responses back to their originating requests (by request ID)
// - Handling the retry loop for focus-stealing failures
// - Restarting the Python process if it crashes unexpectedly
//
// All other TypeScript files go through this — nothing talks to Python
// directly except bridge.ts.
