const supabase = require("../../supabase");
const { sendAdminAlert } = require("../alerts/adminAlertService");
const redisClient = require("../infrastructure/cache/redisClient");
const { pushOrderToIPOS } = require("../iposOrderService");
const {
  registerScheduler,
  markSchedulerStarted,
  markSchedulerSuccess,
  markSchedulerError,
} = require("../scheduler/schedulerHealthService");

const DEFAULT_INTERVAL_MS = Number(process.env.IPOS_RECOVERY_INTERVAL_MS || 5 * 60 * 1000);
const DEFAULT_BATCH_SIZE = Number(process.env.IPOS_RECOVERY_BATCH_SIZE || 3);

let timer = null;
let running = false;

function nowIso() {
  return new Date().toISOString();
}

function nextRetryIso(retryCount) {
  const schedule = [5, 15, 60, 360, 1440];
  const minutes = schedule[Math.min(retryCount - 1, schedule.length - 1)] || 1440;
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function enqueueIposRecovery({
  order_id,
  transaction_code = null,
  reason = "ipos_push_failed",
} = {}) {
  if (!order_id) {
    return { success:false, skipped:true, reason:"missing_order_id" };
  }

  const { data: existing } = await supabase
    .from("ipos_sync_queue")
    .select("id")
    .eq("order_id", order_id)
    .in("status", ["pending", "processing"])
    .limit(1);

  if (existing && existing.length > 0) {
    return { success:true, skipped:true, reason:"already_pending" };
  }

  const { data, error } = await supabase
    .from("ipos_sync_queue")
    .insert({
      order_id: String(order_id),
      transaction_code,
      status: "pending",
      retry_count: 0,
      last_error: reason,
      next_retry_at: nowIso(),
      updated_at: nowIso(),
    })
    .select()
    .maybeSingle();

  if (error) {
    console.warn("[IPOS RECOVERY] enqueue failed:", error.message);
    return { success:false, error:error.message };
  }

  return { success:true, data };
}

async function releaseStuckJobs() {
  const { error } = await supabase
    .from("ipos_sync_queue")
    .update({
      status: "pending",
      locked_until: null,
      updated_at: nowIso(),
    })
    .eq("status", "processing")
    .lt("locked_until", nowIso());

  if (error) console.warn("[IPOS RECOVERY] release stuck failed:", error.message);
}

async function claimPendingJobs(limit = DEFAULT_BATCH_SIZE) {
  const { data: jobs, error } = await supabase
    .from("ipos_sync_queue")
    .select("*")
    .eq("status", "pending")
    .lte("next_retry_at", nowIso())
    .order("created_at", { ascending:true })
    .limit(limit);

  if (error) throw new Error(error.message);
  if (!jobs || jobs.length === 0) return [];

  const ids = jobs.map(j => j.id);

  const { data: locked, error: lockErr } = await supabase
    .from("ipos_sync_queue")
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
  await supabase
    .from("ipos_sync_queue")
    .update({
      status: "done",
      processed_at: nowIso(),
      locked_until: null,
      last_error: null,
      updated_at: nowIso(),
    })
    .eq("id", job.id);
}

async function failJob(job, errorMessage) {
  const retryCount = Number(job.retry_count || 0) + 1;
  const status = retryCount >= 6 ? "failed" : "pending";

  await supabase
    .from("ipos_sync_queue")
    .update({
      status,
      retry_count: retryCount,
      last_error: errorMessage,
      next_retry_at: status === "pending" ? nextRetryIso(retryCount) : nowIso(),
      locked_until: null,
      updated_at: nowIso(),
    })
    .eq("id", job.id);

  if (status === "failed") {
    await sendAdminAlert({
      title: "🔴 iPOS Sync thất bại",
      message: `Không thể đẩy đơn ${job.order_code || job.order_id} lên iPOS sau ${retryCount} lần thử. Lỗi: ${errorMessage}. Vui lòng kiểm tra System Health.`,
      source: "ipos_sync_failed",
    }).catch(()=>{});
  }
}

async function processIposSyncQueue({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  if (running) return { success:true, skipped:true, reason:"already_running" };
  running = true;

  const lockKey = "ipos:sync:recovery:lock";

  try {
    const locked = await redisClient
      .set(lockKey, "1", "NX", "EX", 240)
      .catch(() => null);

    if (!locked) {
      return { success:true, skipped:true, reason:"lock_exists" };
    }

    await releaseStuckJobs();

    const jobs = await claimPendingJobs(batchSize);
    const stats = { total: jobs.length, success:0, failed:0 };

    for (const job of jobs) {
      try {
        const { data: order, error } = await supabase
          .from("orders")
          .select("*")
          .eq("id", job.order_id)
          .single();

        if (error || !order) {
          await failJob(job, "order_not_found");
          stats.failed++;
          continue;
        }

        if (order.pos_sync_status === "success") {
          await completeJob(job);
          stats.success++;
          continue;
        }

        const result = await pushOrderToIPOS({
          order,
          transaction_code: job.transaction_code || order.order_code || String(order.id),
        });

        if (result?.success) {
          await completeJob(job);
          stats.success++;
        } else {
          await failJob(job, result?.error || "ipos_retry_failed");
          stats.failed++;
        }
      } catch (e) {
        await failJob(job, e.message);
        stats.failed++;
      }
    }

    return { success:true, stats };
  } catch (e) {
    console.warn("[IPOS RECOVERY] process failed:", e.message);
    return { success:false, error:e.message };
  } finally {
    running = false;
    await redisClient.del(lockKey).catch(() => {});
  }
}

function startIposSyncRecoveryWorker() {
  if (process.env.IPOS_RECOVERY_WORKER_ENABLED === "false") {
    console.log("[IPOS RECOVERY] worker disabled");
    return;
  }

  if (timer) return;

  registerScheduler({
    key: "ipos_recovery_worker",
    name: "iPOS Recovery Worker",
    interval_ms: DEFAULT_INTERVAL_MS,
    type: "worker",
  });

  markSchedulerStarted("ipos_recovery_worker");

  console.log("[IPOS RECOVERY] worker started", {
    interval_ms: DEFAULT_INTERVAL_MS,
    batch_size: DEFAULT_BATCH_SIZE,
  });

  setTimeout(() => {
    processIposSyncQueue().then(r => {
      markSchedulerSuccess("ipos_recovery_worker", r?.stats || r || {});
      if (r?.stats?.total) console.log("[IPOS RECOVERY] boot run:", r.stats);
    }).catch(e => markSchedulerError("ipos_recovery_worker", e));
  }, 45 * 1000);

  timer = setInterval(() => {
    processIposSyncQueue().then(r => {
      markSchedulerSuccess("ipos_recovery_worker", r?.stats || r || {});
      if (r?.stats?.total) console.log("[IPOS RECOVERY] tick:", r.stats);
    }).catch(e => markSchedulerError("ipos_recovery_worker", e));
  }, DEFAULT_INTERVAL_MS);
}

module.exports = {
  enqueueIposRecovery,
  processIposSyncQueue,
  startIposSyncRecoveryWorker,
};
