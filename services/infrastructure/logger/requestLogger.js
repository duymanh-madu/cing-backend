const logger =
  require("./logger");

function requestLogger(
  req,
  res,
  next
) {

  const start =
    Date.now();

  res.on(
    "finish",

    () => {

      const duration =
        Date.now() - start;

      logger.info(
        "HTTP Request",
        {

          method:
            req.method,

          url:
            req.originalUrl,

          status:
            res.statusCode,

          duration,

          ip:
            req.ip,

          request_id:
            req.request_id ||
            null,

        }
      );

    }
  );

  next();

}

module.exports =
  requestLogger;