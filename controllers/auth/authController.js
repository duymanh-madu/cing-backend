const authService =
  require(
    "../../services/auth/authService"
  );

const {
  evaluateCachedMemberAppOpen,
} = require(
  "../../services/campaign/cachedMemberAppOpenService"
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
          req.body.refreshToken ||
          req.body.refresh_token,
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
 * CACHED MEMBER APP OPEN
 * =====================================================
 *
 * This endpoint does NOT authenticate a customer,
 * issue a JWT, or expose customer data.
 *
 * Shell-cached identity is treated only as an app-open
 * signal. Server-side canonical customer + player
 * identity remains the authority.
 */

async function openCachedMemberApp(
  req,
  res,
  next
) {

  try {

    await evaluateCachedMemberAppOpen({
      phone:
        req.body?.phone ||
        "",

      zaloUserId:
        req.body?.zalo_id ||
        req.body?.zaloId ||
        "",

      installationId:
        req.body?.installation_id ||
        req.body?.installationId ||
        "",

      source:
        req.body?.source ||
        "zalo-miniapp-shell-cache",
    });

    /*
     * Deliberately generic response:
     * do not expose whether a supplied identity pair
     * exists or whether a reward was granted.
     */
    return res.json({
      success: true,
    });

  } catch (error) {

    next(error);

  }

}

/**
 * =====================================================
 * SESSION OPEN
 * =====================================================
 */

async function openSession(
  req,
  res,
  next
) {

  try {

    const evaluation =
      await authService
        .evaluateAuthenticatedSessionEntry({
          customer:
            req.customer,

          installationId:
            req.body?.installation_id ||
            req.body?.installationId ||
            "",

          source:
            req.body?.source ||
            "zalo-miniapp-session",
        });

    return res.json({

      success: true,

      data: {

        customer:
          req.customer,

        session_entry: {
          evaluated:
            true,

          reward_granted:
            evaluation?.reward_granted ===
            true,
        },

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
  openCachedMemberApp,
  openSession,
  logout,

};