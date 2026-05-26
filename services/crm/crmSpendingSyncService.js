
/**
 * =====================================================
 * CRM SPENDING SYNC SERVICE
 * services/crm/crmSpendingSyncService.js
 * =====================================================
 * Nhiệm vụ: Đọc danh sách player từ Supabase,
 * gọi iPos /member_transactions cho từng người,
 * tính tổng tiêu dùng theo các period,
 * ghi lại vào bảng players (crm_spend_*).
 *
 * Chạy theo cron (mỗi 15-30 phút) HOẶC
 * trigger thủ công qua route /crm/sync-spending
 * =====================================================
 */
 
const supabase   = require("../../supabase");
const foodbook   = require("../foodbook");
 
/**
 * =====================================================
 * PERIOD RANGE HELPERS
 * =====================================================
 */
function getWeekRange() {
  const now   = new Date();
  const vn    = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const day   = vn.getDay();
  const diff  = day === 0 ? -6 : 1 - day;
  const start = new Date(vn);
  start.setDate(vn.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return {
    from: formatDateForIpos(start),
    to:   formatDateForIpos(now),
  };
}
 
function getMonthRange() {
  const now   = new Date();
  const vn    = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const start = new Date(vn.getFullYear(), vn.getMonth(), 1);
  return {
    from: formatDateForIpos(start),
    to:   formatDateForIpos(now),
  };
}
 
function getQuarterRange() {
  const now     = new Date();
  const vn      = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const quarter = Math.floor(vn.getMonth() / 3);
  const start   = new Date(vn.getFullYear(), quarter * 3, 1);
  return {
    from: formatDateForIpos(start),
    to:   formatDateForIpos(now),
  };
}
 
function getYearRange() {
  const now   = new Date();
  const vn    = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const start = new Date(vn.getFullYear(), 0, 1);
  return {
    from: formatDateForIpos(start),
    to:   formatDateForIpos(now),
  };
}
 
/** Format: "2025-01-01 00:00:00" theo iPos API */
function formatDateForIpos(date) {
  const d = new Date(date);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
 
/**
 * =====================================================
 * FETCH SPENDING FOR ONE PERIOD
 * Dùng membership_log (chính xác hơn vì filter được ngày)
 * =====================================================
 */
async function fetchSpendingForPeriod(userId, { from, to }) {
  const result = await foodbook.getMembershipLog(userId, {
    log_type:    "PAY",
    create_from: from,
    create_to:   to,
    page_size:   500,
  });
  return result.data?.total_spent || 0;
}
 
/**
 * =====================================================
 * SYNC ONE PLAYER
 * =====================================================
 */
async function syncOnePlayer(player) {
  const userId = player.phone_number || player.zalo_user_id;
  if (!userId) return null;
 
  try {
    // Lấy tất cả time (total all-time)
    const allTimeResult = await foodbook.getMemberTransactions(userId, 1);
    const allTimeSpent  = allTimeResult.data?.total_spent || 0;
    const allTimeOrders = allTimeResult.data?.total_orders || 0;
 
    // Lấy theo period dùng membership_log
    const [weekSpent, monthSpent, quarterSpent, yearSpent] = await Promise.all([
      fetchSpendingForPeriod(userId, getWeekRange()),
      fetchSpendingForPeriod(userId, getMonthRange()),
      fetchSpendingForPeriod(userId, getQuarterRange()),
      fetchSpendingForPeriod(userId, getYearRange()),
    ]);
 
    // Upsert vào Supabase
    const { error } = await supabase
      .from("players")
      .update({
        crm_spend_alltime:  allTimeSpent,
        crm_spend_weekly:   weekSpent,
        crm_spend_monthly:  monthSpent,
        crm_spend_quarterly: quarterSpent,
        crm_spend_yearly:   yearSpent,
        crm_orders_alltime: allTimeOrders,
        crm_synced_at:      new Date().toISOString(),
      })
      .eq("user_id", player.user_id);
 
    if (error) {
      console.error(`❌ Supabase update error for ${userId}:`, error.message);
      return { user_id: player.user_id, success: false, error: error.message };
    }
 
    console.log(`✅ Synced ${player.zalo_name || userId}: ${allTimeSpent.toLocaleString()}đ all-time`);
    return {
      user_id:    player.user_id,
      success:    true,
      allTimeSpent,
      weekSpent,
      monthSpent,
    };
  } catch (err) {
    console.error(`❌ syncOnePlayer error for ${userId}:`, err.message);
    return { user_id: player.user_id, success: false, error: err.message };
  }
}
 
/**
 * =====================================================
 * SYNC ALL PLAYERS
 * Lấy toàn bộ player có phone_number từ Supabase,
 * sync từng người (có rate limiting để tránh spam iPos)
 * =====================================================
 */
async function syncAllPlayersCrmSpending({ batchSize = 5, delayMs = 1000 } = {}) {
  console.log("🔄 START CRM SPENDING SYNC...");
  const startTime = Date.now();
 
  // Lấy danh sách players có phone
  const { data: players, error } = await supabase
    .from("players")
    .select("user_id, zalo_user_id, phone_number, zalo_name")
    .not("phone_number", "is", null)
    .order("created_at", { ascending: false });
 
  if (error) {
    console.error("❌ Supabase fetch players error:", error.message);
    return { success: false, error: error.message };
  }
 
  console.log(`📋 Found ${players.length} players to sync`);
 
  const results = { success: 0, failed: 0, skipped: 0 };
 
  // Xử lý theo batch để tránh overwhelm iPos API
  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize);
 
    const batchResults = await Promise.all(
      batch.map(p => syncOnePlayer(p))
    );
 
    batchResults.forEach(r => {
      if (!r) results.skipped++;
      else if (r.success) results.success++;
      else results.failed++;
    });
 
    // Rate limiting: chờ giữa các batch
    if (i + batchSize < players.length) {
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
 
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ CRM SYNC DONE in ${elapsed}s — success:${results.success} failed:${results.failed} skipped:${results.skipped}`);
 
  return {
    success: true,
    stats: results,
    elapsed_seconds: elapsed,
    total: players.length,
  };
}
 
/**
 * =====================================================
 * SYNC SINGLE USER (dùng khi user vừa đặt hàng xong)
 * =====================================================
 */
async function syncSingleUserSpending(userId) {
  const { data: player, error } = await supabase
    .from("players")
    .select("user_id, zalo_user_id, phone_number, zalo_name")
    .eq("user_id", userId)
    .single();
 
  if (error || !player) {
    return { success: false, error: "Player not found" };
  }
 
  return syncOnePlayer(player);
}
 
module.exports = {
  syncAllPlayersCrmSpending,
  syncSingleUserSpending,
  syncOnePlayer,
  getWeekRange,
  getMonthRange,
  getQuarterRange,
  getYearRange,
};