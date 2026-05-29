const supabase = require("../../supabase");

async function getOAAccessToken() {
  // Ưu tiên lấy từ Supabase (được refresh tự động)
  try {
    const { data: config } = await supabase
      .from("app_configs")
      .select("zalo_oa_access_token")
      .eq("id", 1)
      .single();
    if (config?.zalo_oa_access_token) return config.zalo_oa_access_token;
  } catch(e) {}
  // Fallback env
  return process.env.ZALO_OA_ACCESS_TOKEN || null;
}

async function decodePhoneToken({ phoneToken }) {
  try {
    if (!phoneToken) return null;

    const secretKey = process.env.ZALO_APP_SECRET;
    const oaAccessToken = await getOAAccessToken();

    if (!secretKey || !oaAccessToken) {
      console.warn("[ZALO_PHONE] Missing ZALO_APP_SECRET or OA access token");
      return null;
    }

    console.log("[ZALO_PHONE] Decoding phone token...");

    const WORKER_URL = process.env.ZALO_PHONE_PROXY_URL || "https://zalo-phone-proxy.duymanh.workers.dev";

    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone_token:      phoneToken,
        oa_access_token:  oaAccessToken,
        app_secret:       secretKey,
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
