const jwt =
  require("jsonwebtoken");

/**
 * =====================================================
 * ACCESS TOKEN
 * =====================================================
 */

function generateAccessToken({
  customer,
}) {

  return jwt.sign(

    {
      customerId:
        customer.id,
    },

    process.env.JWT_SECRET,

    {
      expiresIn: "7d",
    }

  );

}

/**
 * =====================================================
 * REFRESH TOKEN
 * =====================================================
 */

function generateRefreshToken({
  customer,
}) {

  return jwt.sign(

    {
      customerId:
        customer.id,
    },

    process.env.JWT_REFRESH_SECRET,

    {
      expiresIn: "30d",
    }

  );

}

module.exports = {

  generateAccessToken,
  generateRefreshToken,

};