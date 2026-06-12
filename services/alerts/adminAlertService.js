const supabase = require("../../supabase");
const { sendZaloOAMessage } = require("../zaloMessageService");

// Số điện thoại admin nhận cảnh báo — có thể thêm nhiều số, cách nhau bởi dấu phẩy trong env
const ADMIN_PHONES = (process.env.ADMIN_ALERT_PHONES || "0984966336")
  .split(",").map(p => p.trim()).filter(Boolean);

const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 phút — tránh spam cùng 1 loại cảnh báo

/**
 * Gửi cảnh báo cho admin qua Zalo OA + lưu log vào DB
 * Có cooldown theo `source` để tránh gửi liên tục
 */
async function sendAdminAlert({ title, message, source = "system" }) {
  try {
    // Check cooldown — đã gửi cảnh báo cùng source trong 30 phút gần đây chưa
    const cooldownSince = new Date(Date.now() - ALERT_COOLDOWN_MS).toISOString();
    const { data: recent } = await supabase.from("admin_alerts")
      .select("id").eq("source", source)
      .gte("created_at", cooldownSince).limit(1);

    if (recent && recent.length > 0) {
      console.log(`[ADMIN ALERT] Skip (cooldown): ${source}`);
      return { success: true, skipped: true, reason: "cooldown" };
    }

    // Lưu vào DB
    await supabase.from("admin_alerts").insert({
      source, title, message,
      created_at: new Date().toISOString(),
    }).then(() => {}).catch(e => console.warn("[ADMIN ALERT] DB insert failed:", e.message));

    // Gửi Zalo OA cho từng admin
    for (const phone of ADMIN_PHONES) {
      try {
        const { data: player } = await supabase.from("players")
          .select("zalo_user_id").eq("user_id", phone).single();
        if (!player?.zalo_user_id) continue;

        const r = await sendZaloOAMessage({
          zalo_user_id: player.zalo_user_id,
          title,
          message,
        });
        console.log(`[ADMIN ALERT] Sent to ${phone}:`, r.success ? "OK" : r.error);
      } catch (e) {
        console.warn(`[ADMIN ALERT] Failed to send to ${phone}:`, e.message);
      }
    }

    return { success: true };
  } catch (e) {
    console.error("[ADMIN ALERT] Error:", e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { sendAdminAlert, ADMIN_PHONES };
