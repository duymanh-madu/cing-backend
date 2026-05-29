/**
 * Decode Zalo Mini App phone token
 * Requires: access_token (from getAccessToken) + code (from getPhoneNumber)
 * Endpoint: https://graph.zalo.me/v2.0/me/info
 * Headers: access_token + secret_key
 * Body: { code, fields: "phone" }
 */
async function decodePhoneToken({ accessToken, phoneToken }) {
  try {
    if (!accessToken || !phoneToken) {
      console.warn("[ZALO_PHONE] Missing accessToken or phoneToken");
      return null;
    }

    const secretKey = process.env.ZALO_APP_SECRET;
    if (!secretKey) {
      console.warn("[ZALO_PHONE] ZALO_APP_SECRET not set");
      return null;
    }

    console.log("[ZALO_PHONE] Decoding phone token...");

    const response = await fetch("https://graph.zalo.me/v2.0/me/info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": accessToken,
        "secret_key": secretKey,
      },
      body: JSON.stringify({
        code: phoneToken,
        fields: "phone",
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
