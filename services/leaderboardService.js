const supabase = require("../supabase");

function getPeriodRange(period, from, to) {
  const now = new Date();
  const vnNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));

  if (period === "weekly") {
    const day = vnNow.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const start = new Date(vnNow);
    start.setDate(vnNow.getDate() + diff);
    start.setHours(0,0,0,0);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (period === "monthly") {
    const start = new Date(vnNow.getFullYear(), vnNow.getMonth(), 1);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (period === "yearly") {
    const start = new Date(vnNow.getFullYear(), 0, 1);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (period === "custom" && from && to) {
    return { from: new Date(from).toISOString(), to: new Date(to + "T23:59:59").toISOString() };
  }
  return null; // all time
}

async function getTopSpenders({ period = "all", from, to, limit = 100 } = {}) {
  const range = getPeriodRange(period, from, to);

  if (!range) {
    const { data, error } = await supabase
      .from("players")
      .select("user_id, zalo_name, name, avatar, total_spent_all_time, total_orders, crm_tier, phone")
      .order("total_spent_all_time", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map((p, i) => ({
      rank: i + 1,
      user_id: p.user_id,
      player_name: p.zalo_name || p.name || "Cing iu",
      avatar: p.avatar || "",
      total_spent_all_time: p.total_spent_all_time || 0,
      total_orders: p.total_orders || 0,
      crm_tier: p.crm_tier || "",
    }));
  }

  const { data, error } = await supabase
    .from("orders")
    .select("user_id, total_amount, customer_name")
    .eq("payment_status", "paid")
    .gte("created_at", range.from)
    .lte("created_at", range.to);

  if (error) throw error;

  const userMap = {};
  (data || []).forEach(order => {
    if (!order.user_id) return;
    if (!userMap[order.user_id]) {
      userMap[order.user_id] = {
        user_id: order.user_id,
        player_name: order.customer_name || "Cing iu",
        total_spent_all_time: 0,
        total_orders: 0,
        avatar: "",
        crm_tier: "",
      };
    }
    userMap[order.user_id].total_spent_all_time += order.total_amount || 0;
    userMap[order.user_id].total_orders++;
  });

  const userIds = Object.keys(userMap);
  if (userIds.length > 0) {
    const { data: players } = await supabase
      .from("players")
      .select("user_id, zalo_name, avatar, crm_tier")
      .in("user_id", userIds);
    (players || []).forEach(p => {
      if (userMap[p.user_id]) {
        userMap[p.user_id].player_name = p.zalo_name || userMap[p.user_id].player_name;
        userMap[p.user_id].avatar = p.avatar || "";
        userMap[p.user_id].crm_tier = p.crm_tier || "";
      }
    });
  }

  return Object.values(userMap)
    .sort((a, b) => b.total_spent_all_time - a.total_spent_all_time)
    .slice(0, limit)
    .map((u, i) => ({ ...u, rank: i + 1 }));
}

async function getGlobalLeaderboard({ limit = 100 } = {}) {
  return getTopSpenders({ period: "all", limit });
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

async function getUserRank(userId, { period = "all", from, to } = {}) {
  const all = await getTopSpenders({ period, from, to, limit: 1000 });
  const idx = all.findIndex(u => u.user_id === userId || u.user_id === String(userId));
  if (idx === -1) return { rank: null, total: all.length };
  return { ...all[idx], rank: idx + 1, total: all.length };
}

module.exports = { getTopSpenders, getGlobalLeaderboard, getGameLeaderboard, getUserRank };
