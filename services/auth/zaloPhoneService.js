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

    const WORKER_URL = process.env.ZALO_PHONE_PROXY_URL || "https://zalo-phone-proxy.duymanh.workers.dev";
    console.log("[ZALO_PHONE] Decoding via Cloudflare Worker...");

    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone_token:       phoneToken,
        mini_access_token: miniAccessToken,
        app_secret:        secretKey,
      }),
    });

    const data = await response.json();
    console.log("[ZALO_PHONE] API response:", JSON.stringify(data));

    if (data.error || !data.data?.number) {
      console.warn("[ZALO_PHONE] decode failed:", data);
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
