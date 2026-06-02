const supabase = require("../../supabase");

async function decodePhoneToken({ phoneToken, miniAccessToken }) {
  try {
    if (!phoneToken || !miniAccessToken) {
      console.warn("[ZALO_PHONE] Missing phoneToken or miniAccessToken");
      return null;
    }

    const secretKey = process.env.ZALO_APP_SECRET;
    if (!secretKey) {
      console.warn("[ZALO_PHONE] Missing ZALO_APP_SECRET");
      return null;
    }

    // Thử proxy trước, fallback sang Zalo API trực tiếp
    const WORKER_URL = process.env.ZALO_PHONE_PROXY_URL || "";
    let data = null;

    if (WORKER_URL) {
      try {
        const response = await fetch(WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone_token:       phoneToken,
            mini_access_token: miniAccessToken,
            app_secret:        secretKey,
          }),
        });
        const text = await response.text();
        if (text.startsWith("{") || text.startsWith("[")) {
          data = JSON.parse(text);
        } else {
          console.warn("[ZALO_PHONE] Proxy returned non-JSON, falling back to direct API");
        }
      } catch(e) {
        console.warn("[ZALO_PHONE] Proxy failed:", e.message);
      }
    }

    // Fallback: gọi Zalo API trực tiếp
    if (!data || data.error || !data.data?.number) {
      console.log("[ZALO_PHONE] Decoding via Zalo API directly...");
      const zaloRes = await fetch("https://graph.zalo.me/v2.0/me/info", {
        method: "GET",
        headers: {
          "access_token": miniAccessToken,
          "code":         phoneToken,
          "secret_key":   secretKey,
        },
      });
      const zaloText = await zaloRes.text();
      console.log("[ZALO_PHONE] Zalo API response:", zaloText.slice(0, 200));
      if (zaloText.startsWith("{")) {
        data = JSON.parse(zaloText);
      }
    }

    if (!data || data.error || !data.data?.number) {
      console.warn("[ZALO_PHONE] decode failed:", JSON.stringify(data));
      return null;
    }

    const raw = data.data.number.replace(/\D/g, "");
    if (!raw) return null;
    return raw.startsWith("84") ? "0" + raw.slice(2) : raw;

  } catch (e) {
    console.warn("[ZALO_PHONE] decodePhoneToken error:", e.message);
    return null;
  }
}

module.exports = { decodePhoneToken };
