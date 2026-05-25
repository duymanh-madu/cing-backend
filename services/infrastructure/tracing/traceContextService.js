const crypto =
  require("crypto");

/**
 * ============================================
 * TRACE STORAGE
 * ============================================
 */

const traceStorage =
  new Map();

/**
 * ============================================
 * CREATE TRACE CONTEXT
 * ============================================
 */

function createTraceContext(
  payload = {}
) {

  const traceId =
    crypto.randomUUID();

  traceStorage.set(
    traceId,
    {

      trace_id:
        traceId,

      ...payload,

      created_at:
        Date.now(),

      updated_at:
        Date.now(),

    }
  );

  return traceId;

}

/**
 * ============================================
 * SET TRACE CONTEXT
 * ============================================
 */

function setTraceContext(
  traceId,
  payload = {}
) {

  if (!traceId) {

    return null;

  }

  const existing =
    traceStorage.get(
      traceId
    ) || {};

  const updated = {

    ...existing,

    ...payload,

    updated_at:
      Date.now(),

  };

  traceStorage.set(
    traceId,
    updated
  );

  return updated;

}

/**
 * ============================================
 * GET TRACE CONTEXT
 * ============================================
 */

function getTraceContext(
  traceId
) {

  if (!traceId) {

    return null;

  }

  return (
    traceStorage.get(
      traceId
    ) || null
  );

}

/**
 * ============================================
 * RUN WITH TRACE CONTEXT
 * ============================================
 */

async function runWithTraceContext(
  traceId,
  callback
) {

  if (
    typeof callback !==
    "function"
  ) {

    return null;

  }

  const context =
    getTraceContext(
      traceId
    );

  return callback(
    context
  );

}

/**
 * ============================================
 * CLEAR TRACE CONTEXT
 * ============================================
 */

function clearTraceContext(
  traceId
) {

  if (!traceId) {

    return false;

  }

  return traceStorage.delete(
    traceId
  );

}

/**
 * ============================================
 * CLEAR ALL
 * ============================================
 */

function clearAllTraceContexts() {

  traceStorage.clear();

}

/**
 * ============================================
 * TRACE COUNT
 * ============================================
 */

function getTraceCount() {

  return traceStorage.size;

}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {

  createTraceContext,

  setTraceContext,

  getTraceContext,

  runWithTraceContext,

  clearTraceContext,

  clearAllTraceContexts,

  getTraceCount,

};