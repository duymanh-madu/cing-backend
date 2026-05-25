const supabase = require("../supabase");
const { realtimeEventBus } = require("./realtime/realtimeEventBus");

const MISSIONS = {
  checkin:     { plays: 3,  label: "Điểm danh hàng ngày" },
  order_100k:  { plays: 2,  label: "Đặt hàng từ 100.000đ" },
  order_500k:  { plays: 10, label: "Đặt hàng từ 500.000đ" },
};

function todayVN() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

/* ── Lấy trạng thái nhiệm vụ hôm nay ── */
async function getDailyMissions(user_id) {
  const today = todayVN();
  const { data } = await supabase
    .from("daily_missions")
    .select("*")
    .eq("user_id", user_id)
    .eq("mission_date", today);

  return Object.entries(MISSIONS).map(([type, cfg]) => {
    const done = data?.find(m => m.mission_type === type);
    return {
      type,
      label: cfg.label,
      plays: cfg.plays,
      completed: !!done?.completed,
      completed_at: done?.completed_at || null,
    };
  });
}

/* ── Điểm danh ── */
async function doCheckin(user_id) {
  const today = todayVN();

  // Kiem tra da diem danh chua
  const { data: existing } = await supabase
    .from("daily_missions")
    .select("id")
    .eq("user_id", user_id)
    .eq("mission_date", today)
    .eq("mission_type", "checkin")
    .eq("completed", true)
    .maybeSingle();

  if (existing) throw new Error("Bạn đã điểm danh hôm nay rồi!");

  // Upsert mission + award plays
  const { error } = await supabase.from("daily_missions").upsert({
    user_id, mission_date: today, mission_type: "checkin",
    completed: true, plays_awarded: 3, completed_at: new Date().toISOString(),
  }, { onConflict: "user_id,mission_date,mission_type" });

  if (error) throw error;

  // Cong luot choi
  await awardPlays(user_id, 3);

  // Push realtime
  pushMissionEvent(user_id, "checkin", 3);

  return { success: true, plays_awarded: 3, message: "Điểm danh thành công! +3 lượt chơi" };
}

/* ── Check mission khi có đơn hàng ── */
async function checkOrderMissions(user_id, order_amount) {
  const today = todayVN();
  const results = [];

  const missions = [];
  if (order_amount >= 100000) missions.push({ type: "order_100k", plays: 2 });
  if (order_amount >= 500000) missions.push({ type: "order_500k", plays: 10 });

  for (const { type, plays } of missions) {
    const { data: existing } = await supabase
      .from("daily_missions").select("id")
      .eq("user_id", user_id).eq("mission_date", today)
      .eq("mission_type", type).eq("completed", true).maybeSingle();

    if (existing) continue;

    await supabase.from("daily_missions").upsert({
      user_id, mission_date: today, mission_type: type,
      completed: true, plays_awarded: plays,
      completed_at: new Date().toISOString(),
    }, { onConflict: "user_id,mission_date,mission_type" });

    await awardPlays(user_id, plays);
    pushMissionEvent(user_id, type, plays);
    results.push({ type, plays });
  }

  return results;
}

/* ── Cộng lượt chơi ── */
async function awardPlays(user_id, amount) {
  const { data: player } = await supabase
    .from("players").select("game_plays").eq("user_id", user_id).maybeSingle();
  
  const current = Number(player?.game_plays || 0);
  await supabase.from("players")
    .update({ game_plays: current + amount })
    .eq("user_id", user_id);
}

/* ── Push realtime event ── */
function pushMissionEvent(user_id, mission_type, plays) {
  try {
    realtimeEventBus.publish({
      event: "mission.completed",
      delivery_type: "BROADCAST",
      payload: { user_id, mission_type, plays_awarded: plays },
      channel: "missions",
      timestamp: new Date().toISOString(),
    });
  } catch(e) {}
}

module.exports = { getDailyMissions, doCheckin, checkOrderMissions, awardPlays };
