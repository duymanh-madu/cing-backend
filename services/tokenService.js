const jwt =
  require("jsonwebtoken");

/**
 * ============================================
 * GENERATE ACCESS TOKEN
 * ============================================
 */

function generateAccessToken({

  user_id,

  role = "user",

}) {

  return jwt.sign(

    {

      user_id,

      role,

    },

    process.env
      .JWT_SECRET,

    {

      expiresIn:
        "7d",

    }

  );

}

/**
 * ============================================
 * VERIFY TOKEN
 * ============================================
 */

function verifyToken(
  token
) {

  return jwt.verify(

    token,

    process.env
      .JWT_SECRET

  );

}

module.exports = {

  generateAccessToken,

  verifyToken,

};