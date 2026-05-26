
/**
 * =====================================================
 * LEADERBOARD SERVICE v2
 * services/leaderboardService.js
 * =====================================================
 * Đọc dữ liệu tiêu dùng THẬT từ iPos CRM
 * (đã sync vào cột crm_spend_* trong bảng players)
 *
 * Period mapping:
 *   weekly    → crm_spend_weekly
 *   monthly   → crm_spend_monthly
 *   quarterly → crm_spend_quarterly
 *   yearly    → crm_spend_yearly
 *   alltime   → crm_spend_alltime  (default)
 *   custom    → tính từ orders app (fallback)
 * =====================================================
 */
 
const supabase = require("../supabase");
 
/**
 * Map period → column trong bảng players
 */
const PERIOD_COLUMN = {
  weekly:    "crm_spend_weekly",
  monthly:   "crm_spend_monthly",
  quarterly: "crm_spend_quarterly",
  yearly:    "crm_spend_yearly",
  alltime:   "crm_spend_alltime",
  all:       "crm_spend_alltime", // alias cũ
};
 
/**
 * =====================================================
 * GET TOP SPENDERS
 * =====================================================
 * @param {object} opts
 * @param {string} opts.period   - weekly | monthly | quarterly | yearly | alltime | custom
 * @param {string} opts.from     - ISO date (custom only)
 * @param {string} opts.to       - ISO date (custom only)
 * @param {number} opts.limit    - default 100
 */
async function getTopSpenders({ period = "alltime", from, to, limit = 100 } = {}) {
 
  const col = PERIOD_COLUMN[period];
 
  // ── CRM-backed periods: đọc thẳng từ players ──────────────────────────────
  if (col) {
    const { data, error } = await supabase
      .from("players")
      .select(`user_id, zalo_name, name, avatar, crm_tier, phone_number,
               crm_spend_alltime, crm_spend_weekly, crm_spend_monthly,
               crm_spend_quarterly, crm_spend_yearly, crm_orders_alltime`)
      .gt(col, 0)                          // chỉ lấy người đã có giao dịch
      .order(col, { ascending: false })
      .limit(limit);
 
    if (error) throw error;
 
    return (data || []).map((p, i) => ({
      rank:                  i + 1,
      user_id:               p.user_id,
      player_name:           p.zalo_name || p.name || "Cing iu",
      avatar:                p.avatar || "",
      crm_tier:              p.crm_tier || "",
      // Giá trị tiêu dùng cho period đang xem
      total_spent:           p[col] || 0,
      // Luôn kèm all-time để UI có thể dùng
      total_spent_all_time:  p.crm_spend_alltime || 0,
      total_orders:          p.crm_orders_alltime || 0,
    }));
  }
 
  // ── Custom range: tính từ bảng orders trong app ────────────────────────────
  if (period === "custom" && from && to) {
    const { data, error } = await supabase
      .from("orders")
      .select("user_id, total_amount, customer_name")
      .eq("payment_status", "paid")
      .gte("created_at", new Date(from).toISOString())
      .lte("created_at", new Date(to + "T23:59:59").toISOString());
 
    if (error) throw error;
 
    const userMap = {};
    (data || []).forEach(order => {
      if (!order.user_id) return;
      if (!userMap[order.user_id]) {
        userMap[order.user_id] = {
          user_id:      order.user_id,
          player_name:  order.customer_name || "Cing iu",
          total_spent:  0,
          total_orders: 0,
          avatar:       "",
          crm_tier:     "",
          total_spent_all_time: 0,
        };
      }
      userMap[order.user_id].total_spent  += order.total_amount || 0;
      userMap[order.user_id].total_orders += 1;
    });
 
    // Enrich với avatar/tier từ players
    const userIds = Object.keys(userMap);
    if (userIds.length > 0) {
      const { data: players } = await supabase
        .from("players")
        .select("user_id, zalo_name, avatar, crm_tier, crm_spend_alltime")
        .in("user_id", userIds);
 
      (players || []).forEach(p => {
        if (userMap[p.user_id]) {
          userMap[p.user_id].player_name           = p.zalo_name || userMap[p.user_id].player_name;
          userMap[p.user_id].avatar                = p.avatar || "";
          userMap[p.user_id].crm_tier              = p.crm_tier || "";
          userMap[p.user_id].total_spent_all_time  = p.crm_spend_alltime || 0;
        }
      });
    }
 
    return Object.values(userMap)
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, limit)
      .map((u, i) => ({ ...u, rank: i + 1 }));
  }
 
  // Fallback nếu period không hợp lệ
  return getTopSpenders({ period: "alltime", limit });
}
 
/**
 * =====================================================
 * GET GLOBAL LEADERBOARD (alias all-time)
 * =====================================================
 */
async function getGlobalLeaderboard({ limit = 100 } = {}) {
  return getTopSpenders({ period: "alltime", limit });
}
 
/**
 * =====================================================
 * GET GAME LEADERBOARD
 * =====================================================
 */
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
 
/**
 * =====================================================
 * GET USER RANK
 * =====================================================
 */
async function getUserRank(userId, { period = "alltime", from, to } = {}) {
  const all = await getTopSpenders({ period, from, to, limit: 2000 });
  const idx = all.findIndex(u => String(u.user_id) === String(userId));
 
  if (idx === -1) {
    // User chưa có trong top → lấy thông tin cá nhân
    const { data: player } = await supabase
      .from("players")
      .select("user_id, zalo_name, avatar, crm_spend_alltime, crm_spend_weekly, crm_spend_monthly")
      .eq("user_id", userId)
      .single();
 
    const col = PERIOD_COLUMN[period] || "crm_spend_alltime";
    return {
      rank:        null,
      total:       all.length,
      user_id:     userId,
      player_name: player?.zalo_name || "Bạn",
      total_spent: player?.[col] || 0,
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