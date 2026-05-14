const AppError =
  require("../utils/AppError");

module.exports = (

  error,

  req,

  res,

  next

) => {

  console.error({

    message:
      error.message,

    stack:
      error.stack,

    path:
      req.originalUrl,

    method:
      req.method,

  });

  /**
   * APP ERROR
   */

  if (
    error instanceof AppError
  ) {

    return res

      .status(
        error.statusCode
      )

      .json({

        success: false,

        code:
          error.code,

        message:
          error.message,

        metadata:
          error.metadata ||

          null,

      });

  }

  /**
   * UNKNOWN
   */

  return res

    .status(500)

    .json({

      success: false,

      code:
        "INTERNAL_SERVER_ERROR",

      message:
        error.message ||

        "Internal Server Error",

    });

};