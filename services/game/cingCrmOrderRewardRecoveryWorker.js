"use strict";

// GAME CENTER V2 — durable CRM Revive Credit recovery.
// Explicitly opt-in through the existing recovery worker flag.
const supabase = require("../../supabase");

let timer = null;
let running = false;

const enabled = () =>
  process.env.CING_CRM_REWARD_RECOVERY_ENABLED === "true";

async function processCingCrmOrderRewardQueue() {
  if (!enabled()) {
    return {
      success: true,
      skipped: true,
      reason: "worker_off",
    };
  }

  if (running) {
    return {
      success: true,
      skipped: true,
      reason: "already_running",
    };
  }

  running = true;

  try {
    const configured =
      Number(
        process.env
          .CING_CRM_REWARD_RECOVERY_BATCH_SIZE ||
          20
      );

    const batchSize =
      Number.isSafeInteger(configured)
        ? Math.min(
            100,
            Math.max(1, configured)
          )
        : 20;

    const {
      data,
      error,
    } = await supabase.rpc(
      "cing_bridge_crm_revive_recover_batch_v1",
      {
        p_batch_size: batchSize,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !Number.isSafeInteger(
        Number(data.checked)
      )
    ) {
      throw new Error(
        "crm_revive_recovery_result_invalid"
      );
    }

    if (Number(data.checked) > 0) {
      console.log(
        "[GAME V2 REVIVE RECOVERY] stats:",
        data
      );
    }

    return {
      success: true,
      stats: data,
    };
  } catch (e) {
    console.warn(
      "[GAME V2 REVIVE RECOVERY] tick failed:",
      e.message
    );

    return {
      success: false,
      error: e.message,
    };
  } finally {
    running = false;
  }
}


function startCingCrmOrderRewardRecoveryWorker() {
  if (!enabled() || timer) {
    return;
  }

  const configured =
    Number(
      process.env
        .CING_CRM_REWARD_RECOVERY_INTERVAL_MS ||
        300000
    );

  const intervalMs =
    Number.isSafeInteger(configured) &&
    configured >= 60000
      ? configured
      : 300000;

  console.log(
    "[GAME V2 REVIVE RECOVERY] explicitly enabled",
    {
      interval_ms: intervalMs,
    }
  );

  setTimeout(
    () => {
      void processCingCrmOrderRewardQueue();
    },
    30000
  );

  timer =
    setInterval(
      () => {
        void processCingCrmOrderRewardQueue();
      },
      intervalMs
    );
}


module.exports = {
  processCingCrmOrderRewardQueue,
  startCingCrmOrderRewardRecoveryWorker,
};
