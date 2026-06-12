const supabase = require("../supabase");
const { realtimeEventBus } = require("./realtime/realtimeEventBus");

const TEMPLATES = {
  LEADERBOARD_PROMOTION: {
    title: "🏆 Bạn vừa thăng hạng!",
    message: "Bạn vừa tăng hạng trên bảng xếp hạng. Tiếp tục phát huy!",
    type: "leaderboard",
  },
  MEMBER_TIER_UP: {
    title: "⭐ Chúc mừng thăng hạng thành viên!",
    message: "Bạn vừa được nâng lên hạng thành viên mới. Nhiều ưu đãi đang chờ bạn!",
    type: "membership",
  },
  GAME_REWARD: {
    title: "🎮 Bạn vừa nhận thưởng!",
    message: "Phần thưởng mini game đã được cộng vào tài khoản.",
    type: "game",
  },
  CAMPAIGN_BROADCAST: {
    title: "🔥 Ưu đãi mới hôm nay",
    message: "Khám phá ưu đãi mới và nhận quà ngay.",
    type: "campaign",
  },
  VOUCHER_RECEIVED: {
    title: "🎁 Bạn nhận được voucher mới",
    message: "Voucher ưu đãi mới đã được thêm vào tài khoản của bạn.",
    type: "voucher",
  },
  MISSION_COMPLETED: {
    title: "✅ Hoàn thành nhiệm vụ!",
    message: "Bạn vừa hoàn thành nhiệm vụ ngày và nhận được phần thưởng.",
    type: "mission",
  },
};

/**
 * Tao va luu notification vao DB
 */
async function createNotification({ user_id, type, title, message, data = {} }) {
  try {
    const { data: notif, error } = await supabase
      .from("notifications")
      .insert({ user_id, type, title, message, data, is_read: false })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return notif;
  } catch(e) {
    console.error("[NOTIF] Create failed:", e.message);
    // Log lỗi vào notification_jobs để System Health Notification Recovery phát hiện
    await supabase.from("notification_jobs").insert({
      notification_id: null,
      job_type: "create_notification",
      job_status: "failed",
      delivery_channel: "realtime",
      priority: "normal",
      retry_count: 0,
      failed_reason: e.message,
      processed_at: new Date().toISOString(),
    }).then(()=>{}).catch(()=>{});
    return null;
  }
}

/**
 * Gui notification realtime den user
 */
async function sendNotification({ user_id, template_key, custom = {}, data = {} }) {
  try {
    const template = TEMPLATES[template_key];
    if (!template) {
      console.warn("[NOTIF] Unknown template:", template_key);
      return null;
    }

    const title = custom.title || template.title;
    const message = custom.message || template.message;
    const type = template.type;

    // Luu vao DB
    const notif = await createNotification({ user_id, type, title, message, data });

    // Push realtime chỉ đến user cụ thể (không broadcast)
    realtimeEventBus.publish({
      event: "notification.new",
      delivery_type: "USER",
      target_user_id: user_id,
      payload: { user_id, notification: { title, message, type, data, created_at: new Date().toISOString() } },
      channel: "notification",
      timestamp: new Date().toISOString(),
    });

    console.log(`[NOTIF] Sent ${template_key} to ${user_id}`);
    return notif;
  } catch(e) {
    console.error("[NOTIF] Send failed:", e.message);
    return null;
  }
}

/**
 * Broadcast cho tat ca users (flash sales, campaigns)
 */
async function broadcastNotification({ template_key, custom = {}, target_user_ids = [] }) {
  try {
    const template = TEMPLATES[template_key];
    if (!template) return;

    const title = custom.title || template.title;
    const message = custom.message || template.message;

    if (target_user_ids && target_user_ids.length > 0) {
      // Gửi đến user cụ thể
      for (const uid of target_user_ids) {
        realtimeEventBus.publish({
          event: "notification.broadcast",
          delivery_type: "ROOM",
          room: `member:${uid}`,
          payload: { notification: { title, message, type: template.type, created_at: new Date().toISOString() } },
          channel: "notification",
          timestamp: new Date().toISOString(),
        });
        // Lưu vào DB
        supabase.from("notifications").insert({
          user_id: uid, title, message, type: template.type || "info",
          is_read: false, created_at: new Date().toISOString(),
        }).then(() => {}).catch(() => {});
      }
    } else {
      realtimeEventBus.publish({
        event: "notification.broadcast",
        delivery_type: "BROADCAST",
        payload: { notification: { title, message, type: template.type, created_at: new Date().toISOString() } },
        channel: "notification",
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`[NOTIF] Broadcast ${template_key}`);
  } catch(e) {
    console.error("[NOTIF] Broadcast failed:", e.message);
  }
}

module.exports = { createNotification, sendNotification, broadcastNotification, TEMPLATES };
