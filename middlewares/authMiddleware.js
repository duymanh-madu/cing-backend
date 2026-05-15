const jwt =
  require("jsonwebtoken");

const customerRepository =
  require(
    "../repositories/customer/customerRepository"
  );

/**
 * =====================================================
 * AUTH MIDDLEWARE
 * =====================================================
 */

async function authMiddleware(
  req,
  res,
  next
) {

  try {

    const authorization =
      req.headers.authorization;

    if (!authorization) {

      return res.status(401).json({

        success: false,

        code:
          "UNAUTHORIZED",

      });

    }

    const token =
      authorization.replace(
        "Bearer ",
        ""
      );

    const payload =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    const customer =
      await customerRepository.findById(
        payload.customerId
      );

    if (!customer) {

      return res.status(401).json({

        success: false,

        code:
          "CUSTOMER_NOT_FOUND",

      });

    }

    req.customer =
      customer;

    next();

  } catch (error) {

    return res.status(401).json({

      success: false,

      code:
        "INVALID_TOKEN",

    });

  }

}

module.exports =
  authMiddleware;