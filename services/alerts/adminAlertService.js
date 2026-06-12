const supabase = require("../../supabase");
const axios = require("axios");
const { sendZaloOAMessage } = require("../zaloMessageService");
const { broadcastNotification } = require("../notificationService");

// Số điện thoại admin nhận cảnh báo — có thể thêm nhiều số, cách nhau bởi dấu phẩy trong env
const ADMIN_PHONES = (process.env.ADMIN_ALERT_PHONES || "0984966336")
  .split(",").map(p => p.trim()).filter(Boolean);

const ADMIN_EMAILS = (process.env.ADMIN_ALERT_EMAILS || "")
  .split(",").map(e => e.trim()).filter(Boolean);
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "alerts@cinghutangkinhbac.com";

async function sendAdminEmailAlert({ title, message }) {
  if (!RESEND_API_KEY || ADMIN_EMAILS.length === 0) return { success: false, skipped: true };
  try {
    const res = await axios.post("https://api.resend.com/emails", {
      from: RESEND_FROM,
      to: ADMIN_EMAILS,
      subject: title,
      html: `<div style="font-family:sans-serif;padding:20px">
        <h2 style="color:#D4531C">${title}</h2>
        <p style="font-size:15px;line-height:1.6">${message}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="color:#999;font-size:12px">Cing Hu Tang Kinh Bắc - Admin Alert System</p>
      </div>`,
    }, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }
    });
    console.log("[ADMIN ALERT] Email sent:", res.data?.id);
    return { success: true, id: res.data?.id };
  } catch(e) {
    console.warn("[ADMIN ALERT] Email failed:", e.response?.data?.message || e.message);
    return { success: false, error: e.response?.data?.message || e.message };
  }
}

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

    // Gửi socket notification trong app — không cần Zalo OA token
    await broadcastNotification({
      template_key: "CAMPAIGN_BROADCAST",
      target_user_ids: ADMIN_PHONES,
      custom: { title, message },
    }).catch(e => console.warn("[ADMIN ALERT] Socket notify failed:", e.message));

    // Gửi email — kênh độc lập, không phụ thuộc Zalo OA
    await sendAdminEmailAlert({ title, message }).catch(()=>{});

    // Gửi Zalo OA cho từng admin (nếu token hợp lệ)
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

module.exports = { sendAdminAlert, sendAdminEmailAlert, ADMIN_PHONES, ADMIN_EMAILS };
