const supabase = require("../../supabase");
const { addPlays } = require("../loyaltyPointService");
const { normalizePhone } = require("../../utils/phoneIdentity");

function toPhone84(phone0) {
  const p = normalizePhone(phone0 || "");
  if (!p) return "";
  return p.startsWith("0") ? "84" + p.slice(1) : p;
}

async function getSpendPerPlay() {
  return supabase
    .from("app_configs")
    .select("spend_per_play")
    .eq("id", 1)
    .single()
    .then(r => Number(r.data?.spend_per_play || 20000))
    .catch(() => 20000);
}

async function awardGamePlaysForOrderSpend({
  user_id,
  order_code,
  amount,
  source_context = "order",
} = {}) {
  const userId = normalizePhone(user_id || "");
  const orderCode = String(order_code || "").trim();
  const totalAmount = Number(amount || 0);

  if (!userId || !orderCode || totalAmount <= 0) {
    return {
      success: false,
      skipped: true,
      reason: "invalid_input",
      user_id: userId,
      order_code: orderCode,
    };
  }

  const { data: existingLog } = await supabase
    .from("analytics_events")
    .select("id")
    .eq("user_id", userId)
    .eq("event_name", "plays_added")
    .contains("event_data", {
      source: "order_spending",
      order_code: orderCode,
    })
    .limit(1)
    .maybeSingle();

  if (existingLog) {
    return {
      success: true,
      skipped: true,
      reason: "already_awarded",
      user_id: userId,
      order_code: orderCode,
    };
  }

  const spendPerPlay = await getSpendPerPlay();
  const playsToAdd = Math.floor(totalAmount / (spendPerPlay || 20000));

  if (playsToAdd <= 0) {
    return {
      success: true,
      skipped: true,
      reason: "below_threshold",
      user_id: userId,
      order_code: orderCode,
    };
  }

  const { data: player } = await supabase
    .from("players")
    .select("game_plays, plays_from_spend")
    .eq("user_id", userId)
    .maybeSingle();

  const currentPlays = Number(player?.game_plays || 0);
  const currentFromSpend = Number(player?.plays_from_spend || 0);
  const newTotal = currentPlays + playsToAdd;

  await addPlays({
    user_id: userId,
    amount: playsToAdd,
    reason: `Tiêu dùng ${totalAmount.toLocaleString("vi-VN")}đ — đơn ${orderCode}`,
    new_total: newTotal,
    metadata: {
      source: "order_spending",
      source_context,
      order_code: orderCode,
      order_amount: totalAmount,
      spend_per_play: spendPerPlay,
    },
  });

  await supabase
    .from("players")
    .update({
      game_plays: newTotal,
      plays_from_spend: currentFromSpend + playsToAdd,
    })
    .eq("user_id", userId);

  try {
    const { realtimeEventBus } = require("../realtime/realtimeEventBus");
    realtimeEventBus.publish({
      event: "user.updated",
      delivery_type: "BROADCAST",
      payload: {
        phone: userId,
        data: {
          game_plays: newTotal,
          plays_from_spend: currentFromSpend + playsToAdd,
        },
      },
      channel: "membership",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[GAME] user.updated publish failed:", e.message);
  }

  console.log(
    `[GAME] Order spend bonus: +${playsToAdd} plays for ${userId} | ${orderCode} | amount=${totalAmount} | source=${source_context}`
  );

  return {
    success: true,
    skipped: false,
    plays: playsToAdd,
    user_id: userId,
    order_code: orderCode,
  };
}

async function awardProcessedCrmIposOrdersForUser({
  user_id,
  page_size = 500,
} = {}) {
  const phone0 = normalizePhone(user_id || "");
  const phone84 = toPhone84(phone0);
  const ids = Array.from(new Set([phone0, phone84].filter(Boolean)));

  if (ids.length === 0) {
    return { success: false, skipped: true, reason: "invalid_user" };
  }

  let from = 0;
  let checked = 0;
  let awarded = 0;
  let skipped = 0;
  let failed = 0;

  while (true) {
    const { data: orders, error } = await supabase
      .from("crm_orders")
      .select("id, order_code, user_id, order_amount, source, processed, created_at")
      .in("user_id", ids)
      .eq("processed", true)
      .gt("order_amount", 0)
      .order("created_at", { ascending: true })
      .range(from, from + page_size - 1);

    if (error) {
      throw new Error(error.message);
    }

    if (!orders || orders.length === 0) break;

    for (const order of orders) {
      checked++;

      try {
        const result = await awardGamePlaysForOrderSpend({
          user_id: phone0,
          order_code: order.order_code,
          amount: order.order_amount,
          source_context: `crm_orders:${order.source || "unknown"}`,
        });

        if (result?.skipped) skipped++;
        else awarded++;
      } catch (e) {
        failed++;
        console.warn(
          "[GAME] CRM iPOS order play award failed:",
          order.order_code,
          e.message
        );
      }
    }

    if (orders.length < page_size) break;
    from += page_size;
  }

  return {
    success: failed === 0,
    user_id: phone0,
    checked,
    awarded,
    skipped,
    failed,
  };
}

module.exports = {
  awardGamePlaysForOrderSpend,
  awardProcessedCrmIposOrdersForUser,
};
