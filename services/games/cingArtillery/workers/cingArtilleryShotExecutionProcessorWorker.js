"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SHOT EXECUTION PROCESSOR WORKER
 *
 * Owns:
 *   pending execution claim
 *   deterministic processor invocation
 *   claim-fenced failure release
 *
 * Does NOT own:
 *   expired lease recovery
 *   physics implementation
 *   gameplay mutation
 *   feature-gate decisions
 */

const {
  claimShotExecutions,
  releaseShotExecution,
} = require(
  "../services/cingArtilleryShotExecutionService"
);

const {
  processClaimedShotExecutionV1,
} = require(
  "../services/cingArtilleryShotExecutionProcessorV1"
);

const {
  isCingArtilleryExecutionWorkerEnabled,
} = require(
  "../services/cingArtilleryFeatureGateService"
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
  "cing_artillery_shot_execution_processor_worker";

const DEFAULT_INTERVAL_MS =
  250;

const DEFAULT_CLAIM_LIMIT =
  4;

const DEFAULT_LEASE_MS =
  15 * 1000;


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
    "CING_ARTILLERY_SHOT_PROCESSOR_INTERVAL_MS",
    DEFAULT_INTERVAL_MS
  );

const CLAIM_LIMIT =
  readPositiveIntegerEnv(
    "CING_ARTILLERY_SHOT_PROCESSOR_CLAIM_LIMIT",
    DEFAULT_CLAIM_LIMIT
  );

const LEASE_MS =
  readPositiveIntegerEnv(
    "CING_ARTILLERY_SHOT_PROCESSOR_LEASE_MS",
    DEFAULT_LEASE_MS
  );


let timer =
  null;

let running =
  false;


function errorMessage(
  error
) {
  const value =
    String(
      error?.message ||
      error?.code ||
      "Unknown Cing Artillery shot execution processor error"
    )
      .trim();

  return value
    ? value.slice(0, 1000)
    : "Unknown Cing Artillery shot execution processor error";
}


async function processOneExecution(
  execution
) {
  const executionId =
    execution?.id;

  const claimToken =
    execution?.claim_token;

  if (
    !executionId ||
    !claimToken
  ) {
    throw new Error(
      "Claimed Cing Artillery shot execution missing id/claim_token"
    );
  }

  try {
    await processClaimedShotExecutionV1({
      executionId,
      claimToken,
    });

    return {
      success:
        true,
      execution_id:
        executionId,
    };
  } catch (error) {
    /*
     * Release is fenced by the SAME claim_token.
     *
     * If our lease is stale and another claimant owns
     * the execution, PostgreSQL rejects this mutation.
     */
    try {
      await releaseShotExecution({
        executionId,
        claimToken,
        lastError:
          errorMessage(error),
      });
    } catch (releaseError) {
      /*
       * Do not mask the original execution failure.
       * The recovery worker owns expired lease cleanup.
       */
      error.release_error =
        releaseError;
    }

    throw error;
  }
}


async function runCingArtilleryShotExecutionProcessor() {
  if (running) {
    return {
      success:
        true,
      skipped:
        true,
      reason:
        "already_running",
    };
  }

  running =
    true;

  try {
    const workerEnabled =
      await isCingArtilleryExecutionWorkerEnabled();

    if (!workerEnabled) {
      markSchedulerSuccess(
        SCHEDULER_KEY,
        {
          enabled:
            false,
          claimed:
            0,
          processed:
            0,
          failed:
            0,
        }
      );

      return {
        success:
          true,
        skipped:
          true,
        reason:
          "execution_worker_disabled",
      };
    }

    const executions =
      await claimShotExecutions({
        limit:
          CLAIM_LIMIT,
        leaseMs:
          LEASE_MS,
      });

    let processed =
      0;

    let failed =
      0;

    for (
      const execution
      of executions
    ) {
      try {
        await processOneExecution(
          execution
        );

        processed +=
          1;
      } catch (_error) {
        failed +=
          1;
      }
    }

    markSchedulerSuccess(
      SCHEDULER_KEY,
      {
        claimed:
          executions.length,
        processed,
        failed,
      }
    );

    return {
      success:
        true,
      claimed:
        executions.length,
      processed,
      failed,
    };
  } catch (error) {
    markSchedulerError(
      SCHEDULER_KEY,
      error
    );

    return {
      success:
        false,
      error:
        errorMessage(error),
    };
  } finally {
    running =
      false;
  }
}


function startCingArtilleryShotExecutionProcessorWorker() {
  if (timer) {
    return;
  }

  registerScheduler({
    key:
      SCHEDULER_KEY,

    name:
      "Cing Artillery Shot Execution Processor Worker",

    interval_ms:
      INTERVAL_MS,

    type:
      "worker",
  });

  markSchedulerStarted(
    SCHEDULER_KEY
  );

  void runCingArtilleryShotExecutionProcessor();

  timer =
    setInterval(
      () => {
        void runCingArtilleryShotExecutionProcessor();
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


function stopCingArtilleryShotExecutionProcessorWorker() {
  if (!timer) {
    return;
  }

  clearInterval(
    timer
  );

  timer =
    null;
}


module.exports = {
  processOneExecution,
  runCingArtilleryShotExecutionProcessor,
  startCingArtilleryShotExecutionProcessorWorker,
  stopCingArtilleryShotExecutionProcessorWorker,
};
