const supabase = require("../supabase");

const PERIOD_COLUMN = {
  weekly:    "crm_spend_weekly",
  monthly:   "crm_spend_monthly",
  quarterly: "crm_spend_quarterly",
  yearly:    "crm_spend_yearly",
  alltime:   "crm_spend_alltime",
  all:       "crm_spend_alltime",
  custom:    "crm_spend_custom",
};

async function getTopSpenders({ period = "alltime", from, to, limit = 100 } = {}) {
  const col = PERIOD_COLUMN[period] || "crm_spend_alltime";

  const { data, error } = await supabase
    .from("players")
    .select(`user_id, zalo_name, name, avatar, crm_tier,
             crm_spend_alltime, crm_spend_weekly, crm_spend_monthly,
             crm_spend_quarterly, crm_spend_yearly, crm_spend_custom,
             crm_orders_alltime`)
    .gt(col, 0)
    .order(col, { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []).map((p, i) => ({
    rank:                 i + 1,
    user_id:              p.user_id,
    player_name:          p.zalo_name || p.name || "Cing iu",
    avatar:               p.avatar || "",
    crm_tier:             p.crm_tier || "",
    total_spent:          p[col] || 0,
    total_spent_all_time: p.crm_spend_alltime || 0,
    total_orders:         p.crm_orders_alltime || 0,
  }));
}

async function getGlobalLeaderboard({ limit = 100 } = {}) {
  return getTopSpenders({ period: "alltime", limit });
}

async function getGameLeaderboard(gameKey, { limit = 100 } = {}) {
  const { data, error } = await supabase
    .from("game_scores")
    .select("user_id, player_name, avatar, score, created_at")
    .eq("game_key", gameKey)
    .order("score", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((s, i) => ({ ...s, rank: i + 1 }));
}

async function getUserRank(userId, { period = "alltime", from, to } = {}) {
  const all = await getTopSpenders({ period, from, to, limit: 2000 });
  const idx = all.findIndex(u => String(u.user_id) === String(userId));

  if (idx === -1) {
    const col = PERIOD_COLUMN[period] || "crm_spend_alltime";
    const { data: player } = await supabase
      .from("players")
      .select("user_id, zalo_name, avatar, crm_spend_alltime, crm_spend_weekly, crm_spend_monthly, crm_spend_custom")
      .eq("user_id", userId)
      .single();

    return {
      rank:                null,
      total:               all.length,
      user_id:             userId,
      player_name:         player?.zalo_name || "Bạn",
      total_spent:         player?.[col] || 0,
      total_spent_all_time: player?.crm_spend_alltime || 0,
    };
  }

  return { ...all[idx], rank: idx + 1, total: all.length };
}

module.exports = {
  getTopSpenders,
  getGlobalLeaderboard,
  getGameLeaderboard,
  getUserRank,
};
