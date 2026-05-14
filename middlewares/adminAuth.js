const jwt =
  require(
    "jsonwebtoken"
  );

module.exports =
  function (
    req,
    res,
    next
  ) {

    try {

      const authHeader =

        req.headers.authorization;

      if (!authHeader) {

        return res.status(401).json({

          success: false,

          message:
            "Unauthorized",

        });

      }

      const token =

        authHeader.replace(
          "Bearer ",
          ""
        );

      const decoded =
        jwt.verify(

          token,

          process.env.JWT_SECRET

        );

      req.admin =
        decoded;

      next();

    } catch (error) {

      console.log(error);

      res.status(401).json({

        success: false,

        message:
          "Invalid token",

      });

    }

  };