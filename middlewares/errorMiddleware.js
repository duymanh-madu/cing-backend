const logger =
  require(
    "../services/loggerService"
  );

function errorMiddleware(

  error,

  req,

  res,

  next

) {

  logger.error(

    error.message,

    {

      path:
        req.originalUrl,

      method:
        req.method,

      stack:
        error.stack,

    }

  );

  return res.status(

    error.statusCode ||
    500

  ).json({

    success: false,

    code:

      error.code ||
      "INTERNAL_ERROR",

    message:
      error.message,

  });

}

module.exports =
  errorMiddleware;