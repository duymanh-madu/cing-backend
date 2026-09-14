const supabase = require("../../../supabase");
const {
  registerScheduler,
  markSchedulerStarted,
  markSchedulerSuccess,
  markSchedulerError,
} = require("../../scheduler/schedulerHealthService");

const WORKER_KEY = "cing_wallet_pos_expired_session_reaper";
const INTERVAL_MS = 60 * 1000;
const BATCH_LIMIT = 50;

let timer = null;
let running = false;

async function runCingWalletPosExpiredSessionReaper() {
  if (running) {
    return {
      skipped: true,
      reason: "local_run_in_progress",
    };
  }

  running = true;

  try {
    const { data, error } = await supabase.rpc(
      "cing_wallet_expire_stale_manual_pos_sessions_batch_v1",
      {
        p_limit: BATCH_LIMIT,
      }
    );

    if (error) {
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;

    return {
      skipped: false,
      scanned: Number(row?.scanned || 0),
      expired: Number(row?.expired || 0),
    };
  } finally {
    running = false;
  }
}

function startCingWalletPosExpiredSessionReaperWorker() {
  if (timer) {
    return;
  }

  registerScheduler({
    key: WORKER_KEY,
    name: "Cing Wallet POS Expired Session Reaper",
    interval_ms: INTERVAL_MS,
    type: "worker",
  });

  markSchedulerStarted(WORKER_KEY);

  const execute = async () => {
    try {
      const result =
        await runCingWalletPosExpiredSessionReaper();

      markSchedulerSuccess(
        WORKER_KEY,
        result
      );

      return result;
    } catch (error) {
      markSchedulerError(
        WORKER_KEY,
        error
      );
      throw error;
    }
  };

  execute().catch(() => {});

  timer = setInterval(() => {
    execute().catch(() => {});
  }, INTERVAL_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

module.exports = {
  startCingWalletPosExpiredSessionReaperWorker,
  runCingWalletPosExpiredSessionReaper,
};
