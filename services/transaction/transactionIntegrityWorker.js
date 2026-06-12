const {
  getTransactionIntegritySnapshot,
} = require("./transactionIntegrityService");

const {
  registerScheduler,
  markSchedulerStarted,
  markSchedulerSuccess,
  markSchedulerError,
} = require("../scheduler/schedulerHealthService");
const { sendAdminAlert } = require("../alerts/adminAlertService");
const redisClient = require("../infrastructure/cache/redisClient");

const DEFAULT_INTERVAL_MS =
  Number(process.env.TRANSACTION_INTEGRITY_INTERVAL_MS || 5 * 60 * 1000);

let timer = null;
let running = false;
let consecutiveIssues = 0;
const ALERT_THRESHOLD = 5;

async function runTransactionIntegrityCheck() {
  if (running) return { success:true, skipped:true, reason:"already_running" };
  running = true;

  try {
    const snapshot = await getTransactionIntegritySnapshot({
      autoRecover: true,
      graceMinutes: Number(process.env.TRANSACTION_INTEGRITY_GRACE_MINUTES || 10),
    });

    markSchedulerSuccess("transaction_integrity_worker", {
      missing_crm: snapshot.missing_crm,
      missing_ipos: snapshot.missing_ipos,
      paid_orders_today: snapshot.paid_orders_today,
    });

    // Theo dõi số lần liên tiếp phát hiện vấn đề chưa tự fix được
    const hasIssue = (snapshot.missing_crm > 0 || snapshot.missing_ipos > 0);
    if (hasIssue) {
      consecutiveIssues++;
      console.warn(`[TX INTEGRITY] Phát hiện vấn đề lần ${consecutiveIssues}: missing_crm=${snapshot.missing_crm}, missing_ipos=${snapshot.missing_ipos}`);
      if (consecutiveIssues >= ALERT_THRESHOLD) {
        await sendAdminAlert({
          title: "⚠️ Cảnh báo Transaction Integrity",
          message: `Hệ thống phát hiện ${snapshot.missing_crm} đơn thiếu CRM sync và ${snapshot.missing_ipos} đơn thiếu iPOS sync, đã thử tự fix ${consecutiveIssues} lần không thành công. Vui lòng kiểm tra System Health.`,
          source: "transaction_integrity",
        });
        consecutiveIssues = 0; // reset sau khi đã cảnh báo, tránh spam
      }
    } else {
      consecutiveIssues = 0;
    }

    // Check webhook dedup — phát hiện đơn bị skip nhầm do idempotency
    try {
      const now = new Date();
      const curHour = now.toISOString().slice(0,13);
      const prevHour = new Date(now.getTime() - 3600*1000).toISOString().slice(0,13);
      const [curCount, prevCount] = await Promise.all([
        redisClient.get(`ipos:dedup_skip:${curHour}`).catch(()=>null),
        redisClient.get(`ipos:dedup_skip:${prevHour}`).catch(()=>null),
      ]);
      const total = Number(curCount||0) + Number(prevCount||0);
      if (total > 50) {
        await sendAdminAlert({
          title: "🔴 Webhook iPOS: nhiều duplicate bị skip",
          message: `Phát hiện ${total} sự kiện duplicate bị skip trong 2h qua — có thể đơn hàng đang bị bỏ sót. Vui lòng kiểm tra System Health.`,
          source: "webhook_dedup_high",
        });
      }
    } catch(e) {
      console.warn("[TX INTEGRITY] dedup check failed:", e.message);
    }

    return { success:true, data:snapshot };
  } catch (e) {
    markSchedulerError("transaction_integrity_worker", e);
    return { success:false, error:e.message };
  } finally {
    running = false;
  }
}

function startTransactionIntegrityWorker() {
  if (process.env.TRANSACTION_INTEGRITY_WORKER_ENABLED === "false") {
    console.log("[TX INTEGRITY] worker disabled");
    return;
  }

  if (timer) return;

  registerScheduler({
    key: "transaction_integrity_worker",
    name: "Transaction Integrity Worker",
    interval_ms: DEFAULT_INTERVAL_MS,
    type: "worker",
  });

  markSchedulerStarted("transaction_integrity_worker");

  console.log("[TX INTEGRITY] worker started", {
    interval_ms: DEFAULT_INTERVAL_MS,
  });

  setTimeout(() => {
    runTransactionIntegrityCheck().then(r => {
      if (r?.data?.missing_crm || r?.data?.missing_ipos) {
        console.warn("[TX INTEGRITY] boot issues:", {
          missing_crm: r.data.missing_crm,
          missing_ipos: r.data.missing_ipos,
        });
      }
    }).catch(e => markSchedulerError("transaction_integrity_worker", e));
  }, 60 * 1000);

  timer = setInterval(() => {
    runTransactionIntegrityCheck().then(r => {
      if (r?.data?.missing_crm || r?.data?.missing_ipos) {
        console.warn("[TX INTEGRITY] tick issues:", {
          missing_crm: r.data.missing_crm,
          missing_ipos: r.data.missing_ipos,
        });
      }
    }).catch(e => markSchedulerError("transaction_integrity_worker", e));
  }, DEFAULT_INTERVAL_MS);
}

module.exports = {
  runTransactionIntegrityCheck,
  startTransactionIntegrityWorker,
};
