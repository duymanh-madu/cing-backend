const {
  createRequestId,
  createTraceId,
  createCorrelationId,
} = require(
  "../services/infrastructure/tracing/requestTraceService"
);

const {
  setTraceContext,
  clearTraceContext,
} = require(
  "../services/infrastructure/tracing/traceContextService"
);

const crypto =
  require("crypto");

function requestContextMiddleware(

  req,

  res,

  next

) {

  const request_id =

  createRequestId();

const trace_id =

  createTraceId();

const correlation_id =

  createCorrelationId();

/**
 * ============================================
 * REQUEST CONTEXT
 * ============================================
 */

req.request_id =
  request_id;

req.trace_id =
  trace_id;

req.correlation_id =
  correlation_id;

/**
 * ============================================
 * TRACE CONTEXT
 * ============================================
 */

setTraceContext({

  request_id,

  trace_id,

  correlation_id,

});

  req.request_id =

    crypto.randomUUID();

  req.request_started_at =
    Date.now();

  res.on(

  "finish",

  () => {

    clearTraceContext();

  }

);

next();

}

module.exports =
  requestContextMiddleware;