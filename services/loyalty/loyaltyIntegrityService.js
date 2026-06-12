const supabase = require("../../supabase");

async function getLoyaltyIntegritySnapshot({
  sampleLimit = 20,
} = {}) {

  const [{ data: players }, { data: baselines }, { data: txs }]
    = await Promise.all([
      supabase.from("players")
        .select("user_id,total_points"),

      supabase.from("point_balance_baselines")
        .select("user_id,baseline_points,baseline_at"),

      supabase.from("point_transactions")
        .select("user_id,points,created_at")
    ]);

  const baselineMap = new Map(
    (baselines || []).map(x => [
      x.user_id,
      {
        points: Number(x.baseline_points || 0),
        at: x.baseline_at ? new Date(x.baseline_at).getTime() : 0,
      }
    ])
  );

  const ledgerMap = new Map();

  for (const tx of (txs || [])) {
    const baselineInfo = baselineMap.get(tx.user_id);
    const baselineAt = baselineInfo?.at || 0;
    const txAt = tx.created_at ? new Date(tx.created_at).getTime() : 0;

    // Chỉ tính ledger phát sinh sau baseline.
    // Ledger cũ/trùng thời điểm baseline đã được gói vào baseline_points.
    if (baselineAt && txAt <= baselineAt) continue;

    const current =
      ledgerMap.get(tx.user_id) || 0;

    ledgerMap.set(
      tx.user_id,
      current + Number(tx.points || 0)
    );
  }

  const mismatches = [];

  for (const player of (players || [])) {

    const currentPoints =
      Number(player.total_points || 0);

    const baselineInfo =
      baselineMap.get(player.user_id);

    const baseline =
      baselineInfo?.points || 0;

    const ledger =
      ledgerMap.get(player.user_id) || 0;

    const expected =
      baseline + ledger;

    if (expected !== currentPoints) {
      mismatches.push({
        user_id: player.user_id,
        current_points: currentPoints,
        expected_points: expected,
        baseline_points: baseline,
        ledger_points: ledger,
        diff: currentPoints - expected,
      });
    }
  }

  return {
    status:
      mismatches.length
        ? "warning"
        : "healthy",

    checked_users:
      players?.length || 0,

    mismatch_users:
      mismatches.length,

    sample:
      mismatches.slice(0, sampleLimit),

    checked_at:
      new Date().toISOString(),
  };
}

module.exports = {
  getLoyaltyIntegritySnapshot,
};
