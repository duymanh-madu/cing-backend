class AppError extends Error {

  constructor({

    message = "Internal Server Error",

    statusCode = 500,

    code = "INTERNAL_ERROR",

    metadata = null,

  }) {

    super(message);

    this.name =
      "AppError";

    this.statusCode =
      statusCode;

    this.code =
      code;

    this.metadata =
      metadata;

    this.isOperational =
      true;

    Error.captureStackTrace(
      this,
      this.constructor
    );

  }

}

module.exports =
  AppError;