const {
  releaseExpiredShotExecutions,
} = require(
  "../services/cingArtilleryShotExecutionService"
);

const {
  registerScheduler,
  markSchedulerStarted,
  markSchedulerSuccess,
  markSchedulerError,
} = require(
  "../../../scheduler/schedulerHealthService"
);

const SCHEDULER_KEY =
  "cing_artillery_shot_execution_recovery_worker";

const DEFAULT_INTERVAL_MS =
  30 * 1000;

const DEFAULT_RECOVERY_LIMIT =
  50;

function readPositiveIntegerEnv(
  name,
  fallback
) {
  const raw =
    process.env[name];

  if (
    raw === undefined ||
    raw === null ||
    String(raw).trim() === ""
  ) {
    return fallback;
  }

  const value =
    Number(raw);

  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${name} must be a positive safe integer`
    );
  }

  return value;
}

const INTERVAL_MS =
  readPositiveIntegerEnv(
    "CING_ARTILLERY_SHOT_EXECUTION_RECOVERY_INTERVAL_MS",
    DEFAULT_INTERVAL_MS
  );

const RECOVERY_LIMIT =
  readPositiveIntegerEnv(
    "CING_ARTILLERY_SHOT_EXECUTION_RECOVERY_LIMIT",
    DEFAULT_RECOVERY_LIMIT
  );

let timer =
  null;

let running =
  false;

async function runCingArtilleryShotExecutionRecovery() {
  if (running) {
    return {
      success: true,
      skipped: true,
      reason:
        "already_running",
    };
  }

  running =
    true;

  try {
    /*
     * This worker owns infrastructure recovery only.
     *
     * PostgreSQL remains the sole correctness authority:
     *
     *   - identifies expired processing leases
     *   - locks rows with FOR UPDATE SKIP LOCKED
     *   - invalidates stale fencing tokens
     *   - returns executions to pending
     *
     * This worker must not claim pending executions,
     * execute projectile physics, mutate gameplay state,
     * complete executions or depend on the Artillery
     * feature gate.
     */
    const released =
      await releaseExpiredShotExecutions({
        limit:
          RECOVERY_LIMIT,
      });

    const recoveredCount =
      Array.isArray(released)
        ? released.length
        : 0;

    markSchedulerSuccess(
      SCHEDULER_KEY,
      {
        recovered:
          recoveredCount,
      }
    );

    return {
      success: true,
      recovered:
        recoveredCount,
    };
  } catch (error) {
    markSchedulerError(
      SCHEDULER_KEY,
      error
    );

    return {
      success: false,
      error:
        error?.message ||
        "Unknown Cing Artillery shot execution recovery error",
    };
  } finally {
    running =
      false;
  }
}

function startCingArtilleryShotExecutionWorker() {
  if (timer) {
    return;
  }

  registerScheduler({
    key:
      SCHEDULER_KEY,

    name:
      "Cing Artillery Shot Execution Recovery Worker",

    interval_ms:
      INTERVAL_MS,

    type:
      "worker",
  });

  markSchedulerStarted(
    SCHEDULER_KEY
  );

  /*
   * Run once immediately.
   *
   * Recovery is idempotent and concurrency-safe at the
   * PostgreSQL boundary, so restart/deploy recovery does
   * not require an application-level distributed lock.
   */
  void runCingArtilleryShotExecutionRecovery();

  timer =
    setInterval(
      () => {
        void runCingArtilleryShotExecutionRecovery();
      },
      INTERVAL_MS
    );

  if (
    typeof timer.unref ===
    "function"
  ) {
    timer.unref();
  }
}

module.exports = {
  runCingArtilleryShotExecutionRecovery,
  startCingArtilleryShotExecutionWorker,
};
