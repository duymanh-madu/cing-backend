module.exports = (

  req,

  res

) => {

  return res

    .status(404)

    .json({

      success: false,

      code:
        "ROUTE_NOT_FOUND",

      message:
        "API route not found",

    });

};