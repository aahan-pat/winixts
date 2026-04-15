// Calls bridge.ts to request a World State snapshot from Python and returns
// it as a typed TypeScript object matching the 5.1 schema. Also responsible
// for:
// - Defining or importing the TypeScript types for the snapshot schema
// - Any post-processing of the snapshot before it is passed to the LLM
//   (e.g. filtering, truncating large trees)
