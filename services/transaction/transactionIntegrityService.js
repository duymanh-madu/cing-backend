const supabase = require("../../supabase");
function getVietnamNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function isAfterHoursDeferralStillValid(order, now = new Date()) {
  if (order.pos_sync_status !== "pending_after_hours") return false;

  const vn = getVietnamNowParts(now);
  const minutesNow = vn.hour * 60 + vn.minute;

  // Từ 23:00 đến 08:15 sáng hôm sau: đây là trạng thái hợp lệ, không cảnh báo mismatch.
  // Sau 08:15 nếu vẫn pending_after_hours thì integrity checker được phép cảnh báo.
  return minutesNow >= 23 * 60 || minutesNow < 8 * 60 + 15;
}

const { normalizePhone } = require("../../utils/phoneIdentity");
const { enqueueCrmSyncRecovery } = require("../crm/crmSyncRecoveryWorker");
const { enqueueIposRecovery } = require("../ipos/iposSyncRecoveryWorker");

function todayVNRange() {
  const now = new Date();
  const vn = new Date(now.toLocaleString("en-US", { timeZone:"Asia/Ho_Chi_Minh" }));
  vn.setHours(0,0,0,0);
  const start = new Date(vn.getTime() - 7 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start:start.toISOString(), end:end.toISOString() };
}

function isCrmMissing(order) {
  return order.payment_status === "paid" && order.spending_synced !== true;
}

function isIposMissing(order) {
  if (order.payment_status !== "paid") return false;

  if (["success", "ignored_manual"].includes(order.pos_sync_status)) {
    return false;
  }

  if (isAfterHoursDeferralStillValid(order)) {
    return false;
  }

  return true;
}

async function fetchPaidOrdersToday() {
  const { start, end } = todayVNRange();

  const { data, error } = await supabase
    .from("orders")
    .select("id,order_code,customer_phone,total_amount,payment_status,spending_synced,pos_sync_status,pos_error,created_at,updated_at")
    .eq("payment_status", "paid")
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending:false })
    .limit(500);

  if (error) throw new Error(error.message);
  return data || [];
}

async function recordIssue({ order, issue_type, severity = "warning", last_error = null }) {
  const row = {
    order_id: order.id,
    order_code: order.order_code || null,
    customer_phone: order.customer_phone || null,
    issue_type,
    issue_status: "open",
    severity,
    last_error,
    metadata: {
      total_amount: order.total_amount || 0,
      payment_status: order.payment_status,
      spending_synced: order.spending_synced,
      pos_sync_status: order.pos_sync_status,
      pos_error: order.pos_error || null,
    },
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("transaction_integrity_events")
    .upsert(row, { onConflict:"order_id,issue_type" });

  if (error) console.warn("[TX INTEGRITY] record issue failed:", error.message);
}

async function resolveIssue({ order_id, issue_type }) {
  try {
    const { error } = await supabase
      .from("transaction_integrity_events")
      .update({
        issue_status: "resolved",
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", order_id)
      .eq("issue_type", issue_type)
      .eq("issue_status", "open");

    if (error) {
      console.warn("[TX INTEGRITY] resolve issue failed:", error.message);
    }
  } catch(e) {
    console.warn("[TX INTEGRITY] resolve issue failed:", e.message);
  }
}

async function getTransactionIntegritySnapshot({ autoRecover = false, graceMinutes = 10 } = {}) {
  const orders = await fetchPaidOrdersToday();
  const now = Date.now();
  const graceMs = graceMinutes * 60 * 1000;

  const missingCrm = [];
  const missingIpos = [];

  for (const order of orders) {
    const ageMs = now - new Date(order.created_at).getTime();
    const beyondGrace = ageMs >= graceMs;

    if (isCrmMissing(order)) {
      missingCrm.push(order);

      if (beyondGrace) {
        await recordIssue({
          order,
          issue_type: "missing_crm_sync",
          severity: "critical",
          last_error: "Paid order has not synced CRM spending",
        });
      }

      if (autoRecover) {
        const phone = normalizePhone(order.customer_phone || "");
        if (phone) {
          await enqueueCrmSyncRecovery({
            user_id: phone,
            phone,
            order_id: order.id,
            source: "transaction_integrity",
          }).catch(e => console.warn("[TX INTEGRITY] CRM enqueue failed:", e.message));
        }
      }
    } else {
      await resolveIssue({ order_id: order.id, issue_type: "missing_crm_sync" });
    }

    if (isIposMissing(order)) {
      missingIpos.push(order);

      if (beyondGrace) {
        await recordIssue({
          order,
          issue_type: "missing_ipos_sync",
          severity: "critical",
          last_error: order.pos_error || "Paid order has not synced iPOS",
        });
      }

      if (autoRecover) {
        await enqueueIposRecovery({
          order_id: order.id,
          transaction_code: order.order_code || String(order.id),
          reason: "transaction_integrity",
        }).catch(e => console.warn("[TX INTEGRITY] iPOS enqueue failed:", e.message));
      }
    } else {
      await resolveIssue({ order_id: order.id, issue_type: "missing_ipos_sync" });
    }
  }

  const crmSynced = orders.length - missingCrm.length;
  const iposSynced = orders.length - missingIpos.length;

  const { data: openEvents } = await supabase
    .from("transaction_integrity_events")
    .select("*")
    .eq("issue_status", "open")
    .order("detected_at", { ascending:false })
    .limit(50);

  const status =
    missingCrm.length > 0 || missingIpos.length > 0
      ? "critical"
      : "healthy";

  return {
    status,
    paid_orders_today: orders.length,
    crm_synced: crmSynced,
    ipos_synced: iposSynced,
    missing_crm: missingCrm.length,
    missing_ipos: missingIpos.length,
    missing_points: null,
    points_integrity_supported: false,
    open_events: openEvents || [],
    sample_missing_crm: missingCrm.slice(0, 10),
    sample_missing_ipos: missingIpos.slice(0, 10),
    checked_at: new Date().toISOString(),
  };
}

module.exports = {
  getTransactionIntegritySnapshot,
};
