// Public API of the win/ module. Re-exports everything that the rest of the
// application should be able to use — types, tool functions, snapshot access,
// and the event emitter. Nothing outside of win/ should import from individual
// files like win/tools.ts directly; they should import from win/index.ts.
// This keeps the internal structure flexible to change.
