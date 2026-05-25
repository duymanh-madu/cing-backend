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
    const { data: notif } = await supabase
      .from("notifications")
      .insert({ user_id, type, title, message, data, read: false })
      .select()
      .single();
    return notif;
  } catch(e) {
    console.error("[NOTIF] Create failed:", e.message);
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

    // Push realtime den user
    realtimeEventBus.publish({
      event: "notification.new",
      delivery_type: "BROADCAST",
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
async function broadcastNotification({ template_key, custom = {} }) {
  try {
    const template = TEMPLATES[template_key];
    if (!template) return;

    const title = custom.title || template.title;
    const message = custom.message || template.message;

    realtimeEventBus.publish({
      event: "notification.broadcast",
      delivery_type: "BROADCAST",
      payload: { notification: { title, message, type: template.type, created_at: new Date().toISOString() } },
      channel: "notification",
      timestamp: new Date().toISOString(),
    });

    console.log(`[NOTIF] Broadcast ${template_key}`);
  } catch(e) {
    console.error("[NOTIF] Broadcast failed:", e.message);
  }
}

module.exports = { createNotification, sendNotification, broadcastNotification, TEMPLATES };
