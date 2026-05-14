const {
  runWithTraceContext,

  createTraceContext,
} = require(
  "../services/infrastructure/tracing/traceContextService"
);

function traceContextMiddleware(
  req,
  res,
  next
) {
  const context =
    createTraceContext({
      requestId:
        req.headers[
          "x-request-id"
        ],

      traceId:
        req.headers[
          "x-trace-id"
        ],

      correlationId:
        req.headers[
          "x-correlation-id"
        ],
    });

  runWithTraceContext(
    context,
    () => {
      req.traceContext =
        context;

      next();
    }
  );
}

module.exports =
  traceContextMiddleware;