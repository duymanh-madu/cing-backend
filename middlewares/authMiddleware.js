const {

  verifyToken,

} = require(
  "../services/tokenService"
);

async function authMiddleware(

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

      verifyToken(token);

    req.user = decoded;

    next();

  } catch (error) {

    return res.status(401).json({

      success: false,

      message:
        "Invalid token",

    });

  }

}

module.exports =
  authMiddleware;