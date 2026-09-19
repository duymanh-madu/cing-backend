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

const AppError =
  require("../utils/AppError");

/**
 * =====================================================
 * PUBLIC AUTH
 * =====================================================
 */

router.post(
  "/zalo/login",
  authController.loginWithZalo
);

router.get(
  "/player-avatar/:zaloId",
  async (req, res) => {
    try {
      const { zaloId } = req.params;
      const supabase = require("../supabase");
      const { data } = await supabase.from("players")
        .select("avatar")
        .eq("zalo_user_id", zaloId)
        .maybeSingle();
      res.json({ avatar: data?.avatar || null });
    } catch(e) {
      res.json({ avatar: null });
    }
  }
);

router.post(
  "/sync-avatar",
  async (req, res) => {
    try {
      const { zalo_id, avatar, name } = req.body;
      if (!zalo_id || !avatar) return res.json({ success: false });
      const supabase = require("../supabase");
      await Promise.all([
        supabase.from("players").update({ avatar, zalo_avatar: avatar }).eq("zalo_user_id", zalo_id).is("profile_changed_at", null),
        supabase.from("customers").update({ avatar, ...(name ? { name } : {}) }).eq("zalo_id", zalo_id),
        supabase.from("game_scores").update({ avatar }).eq("user_id", 
          (await supabase.from("players").select("user_id").eq("zalo_user_id", zalo_id).maybeSingle()).data?.user_id || ""
        ),
      ]);
      res.json({ success: true });
    } catch(e) {
      res.json({ success: false, error: e.message });
    }
  }
);

router.post(
  "/refresh",
  authController.refreshSession,
  (error, req, res, next) => {
    if (!(error instanceof AppError)) {
      return next(error);
    }

    return res
      .status(error.statusCode)
      .json({
        success: false,
        code: error.code,
        message: error.message,
      });
  }
);

router.post(
  "/member/app-open",
  authController.openCachedMemberApp
);

/*
 * Public endpoint, but possession of the opaque
 * device credential is the authentication factor.
 */
router.post(
  "/device/recover",
  authController.recoverDeviceReauth
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
  "/session/open",
  authMiddleware,
  authController.openSession
);

router.post(
  "/device/register",
  authMiddleware,
  authController.registerDeviceReauth
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