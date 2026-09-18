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

const {
  logAuthInstallationObservation,
} = require(
  "../../services/auth/authInstallationObservability"
);


const deviceReauthService =
  require(
    "../../services/auth/deviceReauthService"
  );

const {
  decodePhoneToken,
} = require(
  "../../services/auth/zaloPhoneService"
);

const {
  normalizePhone,
} = require(
  "../../utils/phoneIdentity"
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

    logAuthInstallationObservation({
      surface: "zalo_login",
      installationId:
        req.body?.installation_id ||
        req.body?.installationId ||
        "",
      requestId:
        req.request_id ||
        null,
    });

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

    logAuthInstallationObservation({
      surface: "member_app_open",
      installationId:
        req.body?.installation_id ||
        req.body?.installationId ||
        "",
      requestId:
        req.request_id ||
        null,
    });

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

    logAuthInstallationObservation({
      surface: "session_open",
      installationId:
        req.body?.installation_id ||
        req.body?.installationId ||
        "",
      requestId:
        req.request_id ||
        null,
    });

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

async function registerDeviceReauth(
  req,
  res,
  next
) {
  try {
    /*
     * Durable re-auth enrollment is a stronger authority
     * than possession of an existing backend JWT.
     *
     * Zalo phone proof must be independently verified by
     * the backend and resolve to the authenticated customer.
     */
    const phoneToken =
      String(
        req.body?.phone_token ||
        req.body?.phoneToken ||
        ""
      ).trim();

    const miniAccessToken =
      String(
        req.body?.mini_access_token ||
        req.body?.miniAccessToken ||
        ""
      ).trim();

    if (
      !phoneToken ||
      !miniAccessToken
    ) {
      return res.status(403).json({
        success: false,
        code:
          "STRONG_ZALO_PROOF_REQUIRED",
      });
    }

    const decodedPhone =
      await decodePhoneToken({
        phoneToken,
        miniAccessToken,
      });

    const verifiedPhone =
      normalizePhone(
        decodedPhone ||
        ""
      );

    const customerPhone =
      normalizePhone(
        req.customer?.phone ||
        ""
      );

    if (
      !verifiedPhone ||
      !customerPhone ||
      verifiedPhone !==
        customerPhone
    ) {
      return res.status(403).json({
        success: false,
        code:
          "INVALID_ZALO_PHONE_PROOF",
      });
    }

    const result =
      await deviceReauthService.register({
        customer:
          req.customer,
        bindingId:
          req.body?.binding_id ||
          req.body?.bindingId ||
          "",
      });

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        code:
          result.code,
      });
    }

    return res.json({
      success: true,
      data: {
        credential:
          result.credential,
        expires_at:
          result.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * =====================================================
 * DEVICE REAUTH RECOVER
 * =====================================================
 */

async function recoverDeviceReauth(
  req,
  res,
  next
) {
  try {
    const result =
      await deviceReauthService.recover({
        bindingId:
          req.body?.binding_id ||
          req.body?.bindingId ||
          "",
        credential:
          req.body?.credential ||
          "",
      });

    if (!result.ok) {
      return res.status(401).json({
        success: false,
        code:
          "INVALID_DEVICE_REAUTH",
      });
    }

    return res.json({
      success: true,
      data: {
        customer:
          result.customer,
        accessToken:
          result.accessToken,
        refreshToken:
          result.refreshToken,
        credential:
          result.credential,
        credential_expires_at:
          result.credentialExpiresAt,
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

    await deviceReauthService
      .revokeCustomer({
        customerId:
          req.customer.id,
      });

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
  registerDeviceReauth,
  recoverDeviceReauth,
  logout,

};