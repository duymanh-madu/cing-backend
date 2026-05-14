const {

  trackRequestLatency,

} = require(

  "../services/infrastructure/metrics/requestLatencyService"

);

const {

  trackRequestStarted,

  trackRequestFinished,

} = require(

  "../services/infrastructure/metrics/processMetricsService"

);


/**
 * =====================================================
 * REQUEST METRICS
 * =====================================================
 */

function requestMetricsMiddleware(

  req,

  res,

  next

) {

  trackRequestStarted();

  const start =

  Date.now();

  res.on(

    "finish",

    () => {

      trackRequestFinished();

      const duration =

  Date.now() - start;

trackRequestLatency(

  duration

);

    }

  );

  next();

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =

  requestMetricsMiddleware;