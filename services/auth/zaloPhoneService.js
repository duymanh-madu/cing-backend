async function decodePhoneToken({ phoneToken }) {
  try {
    if (!phoneToken) return null;

    const secretKey = process.env.ZALO_APP_SECRET;
    const oaAccessToken = process.env.ZALO_OA_ACCESS_TOKEN;

    if (!secretKey || !oaAccessToken) {
      console.warn("[ZALO_PHONE] Missing ZALO_APP_SECRET or ZALO_OA_ACCESS_TOKEN");
      return null;
    }

    console.log("[ZALO_PHONE] Decoding phone token with OA access token...");

    const response = await fetch("https://graph.zalo.me/v2.0/me/info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": oaAccessToken,
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
