const authService =
  require(
    "../../services/auth/authService"
  );

const logger =
  require(
    "../../services/loggerService"
  );

/**
 * =====================================================
 * LOGIN
 * =====================================================
 */

async function loginWithZalo(
  req,
  res,
  next
) {

  try {

    const result =
      await authService.loginWithZalo({
        zaloUser:
          req.body,
      });

    return res.json({

      success: true,

      data:
        result,

    });

  } catch (error) {

    logger.error(
      "loginWithZalo error",
      {
        message:
          error.message,
      }
    );

    next(error);

  }

}

/**
 * =====================================================
 * REFRESH
 * =====================================================
 */

async function refreshSession(
  req,
  res,
  next
) {

  try {

    const result =
      await authService.refreshSession({
        refreshToken:
          req.body.refreshToken,
      });

    return res.json({

      success: true,

      data:
        result,

    });

  } catch (error) {

    next(error);

  }

}

/**
 * =====================================================
 * SESSION
 * =====================================================
 */

async function getSession(
  req,
  res,
  next
) {

  try {

    return res.json({

      success: true,

      data: {

        customer:
          req.customer,

      },

    });

  } catch (error) {

    next(error);

  }

}

/**
 * =====================================================
 * LOGOUT
 * =====================================================
 */

async function logout(
  req,
  res,
  next
) {

  try {

    await authService.logout({
      customerId:
        req.customer.id,
    });

    return res.json({

      success: true,

    });

  } catch (error) {

    next(error);

  }

}

module.exports = {

  loginWithZalo,
  refreshSession,
  getSession,
  logout,

};