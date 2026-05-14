async function adminMiddleware(

  req,

  res,

  next

) {

  try {

    if (

      req.user?.role !==
      "admin"

    ) {

      return res.status(403).json({

        success: false,

        message:
          "Forbidden",

      });

    }

    next();

  } catch (error) {

    return res.status(500).json({

      success: false,

      error:
        error.message,

    });

  }

}

module.exports =
  adminMiddleware;