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