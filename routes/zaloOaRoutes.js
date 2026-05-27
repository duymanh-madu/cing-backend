const express  = require("express");
const router   = express.Router();
const axios    = require("axios");
const supabase = require("../supabase");

const APP_ID     = process.env.ZALO_APP_ID;
const APP_SECRET = process.env.ZALO_APP_SECRET;

// Zalo domain verification
router.get("/zalo_verifierU8VZ5vBvLGrmZyGXZuTg70Mkno3fs1P_CpOu.html", (req, res) => {
  res.send("zalo_verifierU8VZ5vBvLGrmZyGXZuTg70Mkno3fs1P_CpOu");
});

// GET /api/zalo/oa-callback
router.get("/oa-callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("Missing code");

    console.log("[ZALO OA] Calling refresh with app_id:", process.env.ZALO_APP_ID, "refresh_token length:", refresh_token?.length);
    const result = await axios.post("https://oauth.zaloapp.com/v4/oa/access_token", null, {
      params: { app_id: APP_ID, app_secret: APP_SECRET, code, grant_type: "authorization_code" }
    });

    const { access_token, refresh_token, expires_in } = result.data;

    await supabase.from("app_configs").update({
      zalo_oa_access_token:  access_token,
      zalo_oa_refresh_token: refresh_token,
      zalo_oa_token_expiry:  expires_in ? new Date(Date.now() + Number(expires_in) * 1000).toISOString() : null,
    }).eq("id", 1);

    console.log("[ZALO OA] Token saved successfully");
    res.send("<h2>✅ Kết nối Zalo OA thành công! Bạn có thể đóng tab này.</h2>");
  } catch(err) {
    console.error("[ZALO OA] Callback error:", err.response?.data || err.message);
    res.status(500).send("❌ Lỗi: " + (err.response?.data?.message || err.message));
  }
});

// POST /api/zalo/send-message
router.post("/send-message", async (req, res) => {
  try {
    const { user_id, message } = req.body;
    const { data: config } = await supabase.from("app_configs")
      .select("zalo_oa_access_token").eq("id", 1).single();
    const token = config?.zalo_oa_access_token;
    if (!token) return res.status(400).json({ success: false, error: "Chưa kết nối Zalo OA" });

    const result = await axios.post("https://openapi.zalo.me/v3.0/oa/message/cs", {
      recipient: { user_id },
      message:   { text: message },
    }, { headers: { access_token: token } });

    res.json({ success: true, data: result.data });
  } catch(err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

module.exports = router;

// Auto-refresh token
async function refreshZaloToken() {
  try {
    const { data: config } = await supabase.from("app_configs")
      .select("zalo_oa_refresh_token").eq("id", 1).single();
    
    const refresh_token = config?.zalo_oa_refresh_token || process.env.ZALO_OA_REFRESH_TOKEN;
    if (!refresh_token) throw new Error("No refresh token");

    const result = await axios.post("https://oauth.zaloapp.com/v4/oa/access_token", null, {
      headers: { secret_key: process.env.ZALO_APP_SECRET },
      params: {
        app_id:        process.env.ZALO_APP_ID,
        grant_type:    "refresh_token",
        refresh_token,
      }
    });

    console.log("[ZALO OA] Response:", JSON.stringify(result.data));
    const { access_token, refresh_token: new_refresh, expires_in } = result.data;

    await supabase.from("app_configs").update({
      zalo_oa_access_token:  access_token,
      zalo_oa_refresh_token: new_refresh,
      zalo_oa_token_expiry:  new Date(Date.now() + expires_in * 1000).toISOString(),
    }).eq("id", 1);

    console.log("[ZALO OA] Token refreshed successfully");
    return access_token;
  } catch(err) {
    console.error("[ZALO OA] Refresh failed:", err.message, JSON.stringify(err.response?.data));
    return null;
  }
}

// GET /api/zalo/refresh-token
router.get("/refresh-token", async (req, res) => {
  const token = await refreshZaloToken();
  if (token) res.json({ success: true, message: "Token refreshed" });
  else res.status(500).json({ success: false, error: "Refresh failed" });
});

module.exports.refreshZaloToken = refreshZaloToken;

// POST /api/zalo/oa-webhook
router.post("/oa-webhook", async (req, res) => {
  try {
    const body = req.body || {};
    console.log("[ZALO OA WEBHOOK]", JSON.stringify(body).slice(0, 300));
    const redis = require("../services/infrastructure/cache/redisClient");
    await redis.setex("zalo:last_webhook", 3600, JSON.stringify(body));
    res.status(200).json({ success: true });
  } catch(err) {
    console.error("[ZALO OA WEBHOOK] Error:", err.message);
    res.status(200).json({ success: true }); // Luôn trả 200 để Zalo không retry
  }
});

// GET /api/zalo/last-webhook
router.get("/last-webhook", async (req, res) => {
  try {
    const redis = require("../services/infrastructure/cache/redisClient");
    const data = await redis.get("zalo:last_webhook");
    res.json({ data: data ? JSON.parse(data) : null });
  } catch(err) {
    res.json({ data: null });
  }
});
