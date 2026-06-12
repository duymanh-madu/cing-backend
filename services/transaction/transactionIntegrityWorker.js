const {
  getTransactionIntegritySnapshot,
} = require("./transactionIntegrityService");

const {
  registerScheduler,
  markSchedulerStarted,
  markSchedulerSuccess,
  markSchedulerError,
} = require("../scheduler/schedulerHealthService");

const DEFAULT_INTERVAL_MS =
  Number(process.env.TRANSACTION_INTEGRITY_INTERVAL_MS || 5 * 60 * 1000);

let timer = null;
let running = false;

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
