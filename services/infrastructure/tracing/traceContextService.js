const {
  AsyncLocalStorage,
} = require(
  "async_hooks"
);

const crypto = require(
  "crypto"
);

const asyncLocalStorage =
  new AsyncLocalStorage();

/**
 * ==========================================
 * HELPERS
 * ==========================================
 */

function generateTraceId() {
  return crypto.randomUUID();
}

function generateRequestId() {
  return crypto.randomUUID();
}

/**
 * ==========================================
 * CONTEXT
 * ==========================================
 */

function runWithTraceContext(
  context,
  callback
) {
  asyncLocalStorage.run(
    context,
    callback
  );
}

function getTraceContext() {
  return (
    asyncLocalStorage.getStore() ||
    {}
  );
}

function setTraceValue(
  key,
  value
) {
  const store =
    asyncLocalStorage.getStore();

  if (!store) {
    return;
  }

  store[key] = value;
}

/**
 * ==========================================
 * INITIALIZER
 * ==========================================
 */

function createTraceContext({
  requestId,
  traceId,
  correlationId,
} = {}) {
  return {
    request_id:
      requestId ||
      generateRequestId(),

    trace_id:
      traceId ||
      generateTraceId(),

    correlation_id:
      correlationId || null,

    started_at:
      new Date().toISOString(),
  };
}

/**
 * ==========================================
 * EXPORTS
 * ==========================================
 */

module.exports = {
  runWithTraceContext,

  getTraceContext,

  setTraceValue,

  createTraceContext,

  generateTraceId,

  generateRequestId,
};