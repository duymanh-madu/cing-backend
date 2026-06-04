const supabase = require("../supabase");
const { realtimeEventBus } = require("./realtime/realtimeEventBus");

function todayVN() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

// Lấy config missions từ DB (có cache 5 phút)
let _missionCache = null;
let _missionCacheAt = 0;
async function getMissionConfigs() {
  if (_missionCache && Date.now() - _missionCacheAt < 5 * 60 * 1000) return _missionCache;
  const { data } = await supabase.from("mission_configs")
    .select("*").eq("enabled", true).order("created_at");
  _missionCache = data || [];
  _missionCacheAt = Date.now();
  return _missionCache;
}

// Xóa cache khi admin update
function clearMissionCache() { _missionCache = null; }

// Lấy trạng thái nhiệm vụ hôm nay
async function getDailyMissions(user_id) {
  const today = todayVN();
  const configs = await getMissionConfigs();
  const { data } = await supabase.from("daily_missions")
    .select("*").eq("user_id", user_id).eq("mission_date", today);

  return configs.map(cfg => {
    const done = data?.find(m => m.mission_type === cfg.type);
    return {
      type:         cfg.type,
      label:        cfg.label,
      description:  cfg.description || "",
      icon:         cfg.icon || "🎯",
      plays:        cfg.plays || 0,
      points:       cfg.points || 0,
      condition_type:  cfg.condition_type,
      condition_value: cfg.condition_value,
      completed:    !!done?.completed,
      completed_at: done?.completed_at || null,
    };
  });
}

// Điểm danh
async function doCheckin(user_id) {
  const today = todayVN();
  const configs = await getMissionConfigs();
  const cfg = configs.find(c => c.type === "checkin");
  if (!cfg) throw new Error("Nhiệm vụ điểm danh chưa được bật");

  const { data: existing } = await supabase.from("daily_missions")
    .select("id").eq("user_id", user_id).eq("mission_date", today)
    .eq("mission_type", "checkin").eq("completed", true).maybeSingle();
  if (existing) throw new Error("Bạn đã điểm danh hôm nay rồi!");

  await supabase.from("daily_missions").upsert({
    user_id, mission_date: today, mission_type: "checkin",
    completed: true, plays_awarded: cfg.plays,
    completed_at: new Date().toISOString(),
  }, { onConflict: "user_id,mission_date,mission_type" });

  await awardPlays(user_id, cfg.plays);
  pushMissionEvent(user_id, "checkin", cfg.plays);
  return { success: true, plays_awarded: cfg.plays, message: `Điểm danh thành công! +${cfg.plays} lượt chơi` };
}

// Check mission khi có đơn hàng
async function checkOrderMissions(user_id, order_amount) {
  const today = todayVN();
  const configs = await getMissionConfigs();
  const results = [];

  const orderMissions = configs.filter(c => c.condition_type === "order_amount" && order_amount >= c.condition_value);

  for (const cfg of orderMissions) {
    const { data: existing } = await supabase.from("daily_missions").select("id")
      .eq("user_id", user_id).eq("mission_date", today)
      .eq("mission_type", cfg.type).eq("completed", true).maybeSingle();
    if (existing) continue;

    await supabase.from("daily_missions").upsert({
      user_id, mission_date: today, mission_type: cfg.type,
      completed: true, plays_awarded: cfg.plays,
      completed_at: new Date().toISOString(),
    }, { onConflict: "user_id,mission_date,mission_type" });

    await awardPlays(user_id, cfg.plays, cfg.label || cfg.type);
    pushMissionEvent(user_id, cfg.type, cfg.plays);
    results.push({ type: cfg.type, plays: cfg.plays });
  }
  return results;
}

// Cộng lượt chơi
async function awardPlays(user_id, amount, missionLabel = "") {
  const { data: player } = await supabase.from("players")
    .select("game_plays").eq("user_id", user_id).maybeSingle();
  const current = Number(player?.game_plays || 0);
  await supabase.from("players").update({ game_plays: current + amount }).eq("user_id", user_id);
  const { addPlays } = require("./loyaltyPointService");
  await addPlays({ user_id, amount, reason: missionLabel || "Nhiệm vụ hoàn thành", new_total: current + amount }).catch(()=>{});
}

// Push realtime
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

module.exports = { getDailyMissions, doCheckin, checkOrderMissions, awardPlays, getMissionConfigs, clearMissionCache };
