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

    const WORKER_URL = process.env.ZALO_PHONE_PROXY_URL || "";
    if (!WORKER_URL) {
      
      return null;
    }

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
    if (!text.startsWith("{")) {
      console.warn("[ZALO_PHONE] Proxy returned non-JSON");
      return null;
    }

    const data = JSON.parse(text);
    if (data.error || !data.data?.number) {
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
