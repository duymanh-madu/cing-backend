const supabase = require('../supabase');

async function logAnalytics(event_name, user_id, event_data = {}) {
  try {
    await supabase.from('analytics_events').insert({
      event_name, user_id: String(user_id),
      event_data, created_at: new Date().toISOString()
    });
  } catch(e) { /* silent fail */ }
}
const { updateMemberPoint } = require("./foodbook");
const { realtimeEventBus } = require("./realtime/realtimeEventBus");
const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_URL);

const POINT_VALUE = 1000; // 1 diem = 1000 VND

/**
 * Tru diem - goi ham nay bat cu khi nao can tru diem
 * @param {string} phone - SDT user (de tru tren iPOS)
 * @param {string} user_id - user_id trong Supabase
 * @param {number} points - so diem can tru
 * @param {string} reason - ly do tru diem (de log)
 */
async function deductPoints({ phone, user_id, points, reason = "Sử dụng điểm" }) {
  if (!points || points <= 0) throw new Error("Số điểm không hợp lệ");

  // 1. Kiem tra du diem trong Supabase
  const { data: player } = await supabase
    .from("players")
    .select("total_points")
    .eq("user_id", user_id)
    .maybeSingle();

  const currentPoints = Number(player?.total_points || 0);
  if (currentPoints < points) {
    throw new Error(`Không đủ điểm. Cần ${points} điểm, bạn có ${currentPoints} điểm.`);
  }

  // 2. Tru diem trong Supabase truoc
  await supabase.from("players")
    .update({ total_points: currentPoints - points })
    .eq("user_id", user_id);

  // 3. Sync nguoc ve iPOS neu co phone
  if (phone) {
    try {
      const iposPhone = phone.replace(/\D/g,"");
      await updateMemberPoint({
        phone: iposPhone,
        type_change: "MINUS",
        point_change: points,
        note: reason,
      });
      console.log(`[POINTS] Deducted ${points} pts for ${phone} - ${reason}`);
      await logAnalytics('points_deducted', phone, { amount: -points, reason, new_total: currentPoints - points });
    } catch(e) {
      console.warn(`[POINTS] iPOS sync failed (points already deducted locally): ${e.message}`);
      // Khong throw - da tru duoc trong Supabase roi
    }
  }



  // Invalidate membership cache
  try {
    const phoneKey = String(user_id).replace(/\D/g,"");
    const p84 = phoneKey.startsWith("84") ? phoneKey : "84" + phoneKey.slice(1);
    const p0 = phoneKey.startsWith("84") ? "0" + phoneKey.slice(2) : phoneKey;
    await redis.del("membership:" + p84);
    await redis.del("membership:" + p0);
    await redis.del("membership:" + user_id);
  } catch(e) {}
  try {
    realtimeEventBus.publish({
      event: "user.updated",
      delivery_type: "BROADCAST",
      payload: { user_id, phone: user_id, points_changed: true },
      channel: "user",
      timestamp: new Date().toISOString(),
    });
  // Emit membership.points để frontend update ngay
  try {
    const { data: updated2 } = await supabase.from('players')
      .select('total_points').eq('user_id', user_id).single();
    realtimeEventBus.publish({
      event: "membership.points",
      delivery_type: "BROADCAST",
      payload: { user_id, points: updated2?.total_points || 0 },
      channel: "membership",
      timestamp: new Date().toISOString(),
    });
  } catch(e) {}
  } catch(e) {}
  return { success: true, points_deducted: points, remaining: currentPoints - points };
}

/**
 * Cong diem - goi ham nay bat cu khi nao can cong diem
 */
async function addPoints({ phone, user_id, points, reason = "Nhận điểm thưởng" }) {
  if (!points || points <= 0) throw new Error("Số điểm không hợp lệ");

  const { data: player } = await supabase
    .from("players")
    .select("total_points")
    .eq("user_id", user_id)
    .maybeSingle();

  const currentPoints = Number(player?.total_points || 0);

  await supabase.from("players")
    .upsert({ user_id, total_points: currentPoints + points }, { onConflict: "user_id" });

  // Sync ve iPOS neu co phone
  if (phone) {
    try {
      const iposPhone = phone.replace(/\D/g,"");
      await updateMemberPoint({
        phone: iposPhone,
        type_change: "ADD",
        point_change: points,
        note: reason,
      });
    } catch(e) {
      console.warn(`[POINTS] iPOS ADD sync failed: ${e.message}`);
    }
  }


  try {
    realtimeEventBus.publish({
      event: "user.updated",
      delivery_type: "BROADCAST",
      payload: { user_id, phone: user_id, points_changed: true },
      channel: "user",
      timestamp: new Date().toISOString(),
    });
  // Emit membership.points để frontend update ngay
  try {
    const { data: updated2 } = await supabase.from('players')
      .select('total_points').eq('user_id', user_id).single();
    realtimeEventBus.publish({
      event: "membership.points",
      delivery_type: "BROADCAST",
      payload: { user_id, points: updated2?.total_points || 0 },
      channel: "membership",
      timestamp: new Date().toISOString(),
    });
  } catch(e) {}
  } catch(e) {}
  return { success: true, points_added: points, total: currentPoints + points };
}

/**
 * Chuyen diem thanh tien (dung cho giam gia don hang)
 */
function pointsToMoney(points) {
  return points * POINT_VALUE; // 1 diem = 1000 VND
}

/**
 * Chuyen tien thanh diem
 */
function moneyToPoints(amount) {
  return Math.floor(amount / POINT_VALUE);
}

module.exports = { deductPoints, addPoints, pointsToMoney, moneyToPoints, POINT_VALUE };
