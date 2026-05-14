function successResponse({

  res,

  message = "Success",

  data = null,

  meta = null,

  statusCode = 200,

}) {

  return res

    .status(statusCode)

    .json({

      success: true,

      message,

      data,

      meta,

    });

}

function errorResponse({

  res,

  message = "Error",

  code = "INTERNAL_ERROR",

  statusCode = 500,

  error = null,

}) {

  return res

    .status(statusCode)

    .json({

      success: false,

      code,

      message,

      error,

    });

}

module.exports = {

  successResponse,

  errorResponse,

};