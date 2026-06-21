const supabase = require("../../supabase");
const redisClient = require("../infrastructure/cache/redisClient");
const { syncSingleUserSpending } = require("./crmSpendingSyncService");
const { sendAdminAlert } = require("../alerts/adminAlertService");
const { normalizePhone } = require("../../utils/phoneIdentity");
const {
  registerScheduler,
  markSchedulerStarted,
  markSchedulerSuccess,
  markSchedulerError,
} = require("../scheduler/schedulerHealthService");

const WORKER_NAME = "crm-sync-recovery-worker";
const DEFAULT_INTERVAL_MS = Number(process.env.CRM_RECOVERY_INTERVAL_MS || 5 * 60 * 1000);
const DEFAULT_BATCH_SIZE = Number(process.env.CRM_RECOVERY_BATCH_SIZE || 5);
const DEFAULT_STALE_LIMIT = Number(process.env.CRM_RECOVERY_STALE_LIMIT || 1);

let timer = null;
let running = false;

function nowIso() {
  return new Date().toISOString();
}

function isValidVietnamPhone(value) {
  const n = normalizePhone(value || "");
  return /^0[0-9]{9}$/.test(n);
}

function nextRetryIso(retryCount) {
  const minutes = Math.min(60, Math.max(5, retryCount * 10));
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function enqueueCrmSyncRecovery({
  user_id,
  phone,
  order_id = null,
  source = "unknown",
} = {}) {
  const cleanPhone = normalizePhone(phone || user_id || "");
  const uid = normalizePhone(user_id || cleanPhone || "");

  if (!uid || uid.length < 9) {
    return { success: false, skipped: true, reason: "invalid_user_id" };
  }

  const normalizedOrderId = order_id ? String(order_id) : null;

  if (normalizedOrderId) {
    const { data: orderRow } = await supabase
      .from("orders")
      .select("id,spending_synced")
      .eq("id", normalizedOrderId)
      .maybeSingle();

    if (orderRow?.spending_synced === true) {
      return {
        success: true,
        skipped: true,
        reason: "order_already_spending_synced",
        order_id: normalizedOrderId,
      };
    }
  }

  const row = {
    user_id: uid,
    phone: cleanPhone || uid,
    order_id: normalizedOrderId,
    source,
    status: "pending",
    retry_count: 0,
    next_retry_at: nowIso(),
    updated_at: nowIso(),
  };

  let existingQuery = supabase
    .from("crm_sync_queue")
    .select("id,status")
    .eq("user_id", uid)
    .in("status", ["pending", "processing"]);

  if (normalizedOrderId) {
    existingQuery = existingQuery.eq("order_id", normalizedOrderId).eq("source", source);
  }

  const { data: existing } = await existingQuery.limit(1);

  if (existing && existing.length > 0) {
    return {
      success: true,
      skipped: true,
      reason: "already_pending",
    };
  }

  const { data, error } = await supabase
    .from("crm_sync_queue")
    .insert(row)
    .select()
    .maybeSingle();

  if (error) {
    console.warn("[CRM RECOVERY] enqueue failed:", error.message);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

async function claimPendingJobs(limit = DEFAULT_BATCH_SIZE) {
  const now = nowIso();

  const { data: jobs, error } = await supabase
    .from("crm_sync_queue")
    .select("*")
    .eq("status", "pending")
    .lte("next_retry_at", now)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  if (!jobs || jobs.length === 0) return [];

  const ids = jobs.map(j => j.id);

  const { data: locked, error: lockErr } = await supabase
    .from("crm_sync_queue")
    .update({
      status: "processing",
      locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      updated_at: nowIso(),
    })
    .in("id", ids)
    .eq("status", "pending")
    .select("*");

  if (lockErr) throw new Error(lockErr.message);

  return locked || [];
}

async function completeJob(job) {
  const doneAt = nowIso();

  await supabase
    .from("crm_sync_queue")
    .update({
      status: "done",
      processed_at: doneAt,
      locked_until: null,
      last_error: null,
      updated_at: doneAt,
    })
    .eq("id", job.id);

  if (job.order_id) {
    await supabase
      .from("orders")
      .update({
        spending_synced: true,
        updated_at: doneAt,
      })
      .eq("id", job.order_id);

    await supabase
      .from("transaction_integrity_events")
      .update({
        issue_status: "resolved",
        resolved_at: doneAt,
        updated_at: doneAt,
      })
      .eq("order_id", job.order_id)
      .eq("issue_type", "missing_crm_sync")
      .eq("issue_status", "open");
  }
}

async function failJob(job, errorMessage) {
  const retryCount = Number(job.retry_count || 0) + 1;
  const status = retryCount >= 6 ? "failed" : "pending";

  await supabase
    .from("crm_sync_queue")
    .update({
      status,
      retry_count: retryCount,
      last_error: errorMessage,
      next_retry_at: status === "pending" ? nextRetryIso(retryCount) : nowIso(),
      locked_until: null,
      updated_at: nowIso(),
    })
    .eq("id", job.id);

  // Cảnh báo admin khi job thất bại hoàn toàn (đã retry tối đa)
  if (status === "failed") {
    await sendAdminAlert({
      title: "🔴 CRM Sync thất bại",
      message: `Không thể sync CRM cho SĐT ${job.phone || job.user_id} sau ${retryCount} lần thử. Lỗi: ${errorMessage}. Vui lòng kiểm tra và sync tay trong System Health.`,
      source: "crm_sync_failed",
    }).catch(()=>{});
  }
}

async function releaseStuckJobs() {
  const { error } = await supabase
    .from("crm_sync_queue")
    .update({
      status: "pending",
      locked_until: null,
      updated_at: nowIso(),
    })
    .eq("status", "processing")
    .lt("locked_until", nowIso());

  if (error) console.warn("[CRM RECOVERY] release stuck failed:", error.message);
}

async function enqueueStalePlayers(limit = DEFAULT_STALE_LIMIT) {
  const threshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: players, error } = await supabase
    .from("players")
    .select("user_id, phone, phone_number, crm_synced_at, last_seen_at, member_activated")
    .not("user_id", "is", null)
    .or(`crm_synced_at.is.null,crm_synced_at.lt.${threshold}`)
    .order("crm_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    console.warn("[CRM RECOVERY] stale scan failed:", error.message);
    return;
  }

  for (const p of players || []) {
    const uid = normalizePhone(p.phone || p.phone_number || p.user_id || "");

    // Chỉ sync user có số điện thoại Việt Nam thật.
    // Không enqueue Zalo ID / UUID / mã nội bộ để tránh gọi iPOS vô ích.
    if (!isValidVietnamPhone(uid)) continue;

    await enqueueCrmSyncRecovery({
      user_id: uid,
      phone: uid,
      source: "stale_sweep",
    });
  }
}

async function processCrmSyncQueue({ batchSize = DEFAULT_BATCH_SIZE, staleLimit = DEFAULT_STALE_LIMIT } = {}) {
  if (running) return { success: true, skipped: true, reason: "already_running" };
  running = true;

  const lockKey = "crm:sync:recovery:lock";

  try {
    const locked = await redisClient
      .set(lockKey, "1", "NX", "EX", 240)
      .catch(() => null);

    if (!locked) {
      return { success: true, skipped: true, reason: "lock_exists" };
    }

    await releaseStuckJobs();

    // Không quét toàn bộ. Chỉ enqueue vài user stale nhất để phòng miss event khi deploy.
    await enqueueStalePlayers(staleLimit);

    const jobs = await claimPendingJobs(batchSize);
    const stats = { total: jobs.length, success: 0, failed: 0 };

    for (const job of jobs) {
      try {
        const uid = normalizePhone(job.phone || job.user_id || "");
        if (!isValidVietnamPhone(uid)) {
          await failJob(job, "invalid_phone");
          stats.failed++;
          continue;
        }

        const result = await syncSingleUserSpending(uid);

        if (result?.success) {
          await completeJob(job);
          stats.success++;
        } else {
          await failJob(job, result?.error || "sync_failed");
          stats.failed++;
        }
      } catch (e) {
        await failJob(job, e.message);
        stats.failed++;
      }
    }

    return { success: true, stats };
  } catch (e) {
    console.warn("[CRM RECOVERY] process failed:", e.message);
    return { success: false, error: e.message };
  } finally {
    running = false;
    await redisClient.del(lockKey).catch(() => {});
  }
}

function startCrmSyncRecoveryWorker() {
  if (process.env.CRM_RECOVERY_WORKER_ENABLED === "false") {
    console.log("[CRM RECOVERY] worker disabled");
    return;
  }

  if (timer) return;

  registerScheduler({
    key: "crm_recovery_worker",
    name: "CRM Recovery Worker",
    interval_ms: DEFAULT_INTERVAL_MS,
    type: "worker",
  });

  markSchedulerStarted("crm_recovery_worker");

  console.log("[CRM RECOVERY] worker started", {
    interval_ms: DEFAULT_INTERVAL_MS,
    batch_size: DEFAULT_BATCH_SIZE,
    stale_limit: DEFAULT_STALE_LIMIT,
  });

  setTimeout(() => {
    processCrmSyncQueue().then(r => {
      markSchedulerSuccess("crm_recovery_worker", r?.stats || r || {});
      if (r?.stats?.total) console.log("[CRM RECOVERY] boot run:", r.stats);
    }).catch(e => markSchedulerError("crm_recovery_worker", e));
  }, 30 * 1000);

  timer = setInterval(() => {
    processCrmSyncQueue().then(r => {
      markSchedulerSuccess("crm_recovery_worker", r?.stats || r || {});
      if (r?.stats?.total) console.log("[CRM RECOVERY] tick:", r.stats);
    }).catch(e => markSchedulerError("crm_recovery_worker", e));
  }, DEFAULT_INTERVAL_MS);
}

module.exports = {
  enqueueCrmSyncRecovery,
  processCrmSyncQueue,
  startCrmSyncRecoveryWorker,
};
