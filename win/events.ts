// Receives proactive event pushes from Python and re-emits them as a typed
// Node.js EventEmitter. Consumers elsewhere in the codebase can do
// events.on('focus-change', ...) without knowing anything about the Python
// process. Responsible for:
// - Parsing the event stream coming from bridge.ts
// - Distinguishing event messages from request/response messages
// - Emitting strongly-typed events: focus-change, process-start, process-stop
