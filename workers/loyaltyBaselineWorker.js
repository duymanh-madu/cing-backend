/**
 * Loyalty Baseline Auto-Sync Worker
 * Chạy hàng đêm lúc 2AM — so sánh total_points vs baseline,
 * tự re-baseline các user lệch để integrity luôn = 0 mismatch.
 * CRM là nguồn truth: baseline = total_points (không cộng thêm gì)
 */
const supabase = require("../supabase");

async function fetchAllRows(table, columns) {
  const pageSize = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function runBaselineSync() {
  try {
    const [players, baselines] = await Promise.all([
      fetchAllRows("players", "user_id,total_points"),
      fetchAllRows("point_balance_baselines", "user_id,baseline_points"),
    ]);

    const baselineMap = new Map(baselines.map(b => [b.user_id, Number(b.baseline_points || 0)]));
    const now = new Date().toISOString();

    const mismatches = players.filter(p => {
      const pts = Number(p.total_points || 0);
      const base = baselineMap.get(p.user_id) ?? null;
      // Chỉ re-baseline nếu baseline tồn tại và khác total_points
      return base !== null && pts !== base;
    });

    if (mismatches.length === 0) {
      console.log("[BASELINE WORKER] All users in sync, no action needed");
      return;
    }

    console.log(`[BASELINE WORKER] Found ${mismatches.length} mismatches, re-baselining...`);

    let fixed = 0;
    for (const p of mismatches) {
      const pts = Number(p.total_points || 0);
      const { error } = await supabase.from("point_balance_baselines")
        .update({ baseline_points: pts, baseline_at: now })
        .eq("user_id", p.user_id);
      if (!error) fixed++;
      else console.warn("[BASELINE WORKER] Failed for", p.user_id, error.message);
    }

    console.log(`[BASELINE WORKER] Done: ${fixed}/${mismatches.length} re-baselined`);
  } catch (e) {
    console.error("[BASELINE WORKER] Error:", e.message);
  }
}

function getMsUntil2AM() {
  const now = new Date();
  const next2AM = new Date();
  next2AM.setHours(2, 0, 0, 0);
  if (next2AM <= now) next2AM.setDate(next2AM.getDate() + 1);
  return next2AM.getTime() - now.getTime();
}

module.exports = async function startLoyaltyBaselineWorker() {
  console.log("[BASELINE WORKER] Scheduled — runs daily at 2AM");

  // Chạy lần đầu sau 2AM tiếp theo
  setTimeout(async () => {
    await runBaselineSync();
    // Sau đó lặp mỗi 24h
    setInterval(runBaselineSync, 24 * 60 * 60 * 1000);
  }, getMsUntil2AM());
};
