// Request-local provenance. A JSON body cannot fabricate a reusable database read.
const reads = new WeakMap();
function createSessionRead(row) {
  const handle = Object.freeze({});
  reads.set(handle, Object.freeze({ ...row }));
  return handle;
}
function resolveSessionRead(handle, sessionId) {
  const row = handle && reads.get(handle);
  return row?.id === sessionId ? row : null;
}
module.exports = { createSessionRead, resolveSessionRead };
