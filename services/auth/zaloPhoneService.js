const crypto = require("crypto");

/**
 * Decode Zalo Mini App phone token
 * Docs: https://mini.zalo.me/documents/api/getPhoneNumber
 */
async function decodePhoneToken(token) {
  try {
    if (!token) return null;

    const secretKey = process.env.ZALO_MINI_APP_SECRET;
    if (!secretKey) {
      console.warn("[ZALO_PHONE] ZALO_MINI_APP_SECRET not set");
      return null;
    }

    const response = await fetch("https://graph.zalo.me/v2.0/me/info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "secret_key": secretKey,
      },
      body: JSON.stringify({
        access_token: token,
        fields: "phone",
      }),
    });

    const data = await response.json();

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
