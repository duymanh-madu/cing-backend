const express =
  require("express");

const router =
  express.Router();

const authController =
  require(
    "../controllers/auth/authController"
  );

const authMiddleware =
  require(
    "../middlewares/authMiddleware"
  );

/**
 * =====================================================
 * PUBLIC AUTH
 * =====================================================
 */

router.post(
  "/zalo/login",
  authController.loginWithZalo
);

router.post(
  "/refresh",
  authController.refreshSession
);

/**
 * =====================================================
 * AUTHENTICATED
 * =====================================================
 */

router.get(
  "/session",
  authMiddleware,
  authController.getSession
);

router.post(
  "/logout",
  authMiddleware,
  authController.logout
);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;