"use strict";

/*
 * Cing KDS FABi Dormant Worker V1
 *
 * Lifecycle wrapper around ONE already-composed dormant runtime.
 *
 * Important:
 *
 * - construction performs no I/O
 * - construction schedules nothing
 * - start() must be called explicitly
 * - timer capability is injected
 * - next tick is scheduled only AFTER current tick settles
 * - therefore this worker never overlaps its own runOnce calls
 * - runtime branch lease remains cross-instance fencing authority
 *
 * This module does not load env, build credentials, mount routes,
 * listen on ports, or construct database clients.
 */

function workerError(
  code
) {
  const error =
    new Error(code);

  error.code =
    code;

  return error;
}

function requiredFunction(
  value,
  code
) {
  if (
    typeof value !==
      "function"
  ) {
    throw workerError(
      code
    );
  }

  return value;
}

function positiveInteger(
  value,
  code
) {
  const number =
    Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 1
  ) {
    throw workerError(
      code
    );
  }

  return number;
}

function sanitizeErrorCode(
  error
) {
  if (
    error &&
    typeof error.code ===
      "string" &&
    error.code.trim().length > 0
  ) {
    return error.code.trim();
  }

  return "KDS_WORKER_RUN_FAILED";
}

function createFabiKdsDormantWorkerV1({
  runtime,

  scheduleTimer,
  cancelTimer,

  nowProvider,

  intervalMs = 5_000,
  initialDelayMs = 0
} = {}) {
  if (
    !runtime ||
    typeof runtime !==
      "object" ||
    typeof runtime.runOnce !==
      "function" ||
    typeof runtime.status !==
      "function"
  ) {
    throw workerError(
      "KDS_WORKER_RUNTIME_REQUIRED"
    );
  }

  requiredFunction(
    scheduleTimer,
    "KDS_WORKER_TIMER_REQUIRED"
  );

  requiredFunction(
    cancelTimer,
    "KDS_WORKER_CANCEL_TIMER_REQUIRED"
  );

  requiredFunction(
    nowProvider,
    "KDS_WORKER_NOW_PROVIDER_REQUIRED"
  );

  const interval =
    positiveInteger(
      intervalMs,
      "KDS_WORKER_INTERVAL_INVALID"
    );

  const initialDelay =
    Number(initialDelayMs);

  if (
    !Number.isSafeInteger(
      initialDelay
    ) ||
    initialDelay < 0
  ) {
    throw workerError(
      "KDS_WORKER_INITIAL_DELAY_INVALID"
    );
  }

  let started =
    false;

  let closed =
    false;

  let running =
    false;

  let timerHandle =
    null;

  let tickCount =
    0;

  let successCount =
    0;

  let failureCount =
    0;

  let lastStartedAtMs =
    null;

  let lastFinishedAtMs =
    null;

  let lastResultStatus =
    null;

  let lastErrorCode =
    null;

  async function readNow() {
    const value =
      Number(
        await nowProvider()
      );

    if (
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw workerError(
        "KDS_WORKER_NOW_INVALID"
      );
    }

    return value;
  }

  function scheduleNext(
    delay
  ) {
    if (
      !started ||
      closed
    ) {
      return;
    }

    if (
      timerHandle !==
        null
    ) {
      throw workerError(
        "KDS_WORKER_TIMER_ALREADY_SCHEDULED"
      );
    }

    timerHandle =
      scheduleTimer(
        () => {
          timerHandle =
            null;

          void executeTick();
        },
        delay
      );

    if (
      timerHandle ===
        undefined ||
      timerHandle ===
        null
    ) {
      timerHandle =
        null;

      throw workerError(
        "KDS_WORKER_TIMER_HANDLE_INVALID"
      );
    }
  }

  async function executeTick() {
    if (
      !started ||
      closed
    ) {
      return;
    }

    /*
     * Defensive local guard.
     *
     * Normal scheduling cannot reach this because a future tick
     * is created only after the current run settles.
     */
    if (running) {
      throw workerError(
        "KDS_WORKER_OVERLAP_FORBIDDEN"
      );
    }

    running =
      true;

    tickCount++;

    try {
      lastStartedAtMs =
        await readNow();

      const result =
        await runtime.runOnce();

      successCount++;

      lastResultStatus =
        result &&
        typeof result.status ===
          "string"
          ? result.status
          : "completed";

      lastErrorCode =
        null;
    } catch (error) {
      failureCount++;

      lastResultStatus =
        null;

      lastErrorCode =
        sanitizeErrorCode(
          error
        );
    } finally {
      try {
        lastFinishedAtMs =
          await readNow();
      } finally {
        running =
          false;
      }

      if (
        started &&
        !closed
      ) {
        scheduleNext(
          interval
        );
      }
    }
  }

  function start() {
    if (closed) {
      throw workerError(
        "KDS_WORKER_CLOSED"
      );
    }

    if (started) {
      throw workerError(
        "KDS_WORKER_ALREADY_STARTED"
      );
    }

    started =
      true;

    scheduleNext(
      initialDelay
    );

    return status();
  }

  function stop() {
    if (closed) {
      return status();
    }

    started =
      false;

    if (
      timerHandle !==
        null
    ) {
      cancelTimer(
        timerHandle
      );

      timerHandle =
        null;
    }

    /*
     * An in-flight runOnce cannot be cancelled safely here.
     * It is allowed to finish, but finally{} will not schedule
     * another tick because started=false.
     */
    return status();
  }

  function close() {
    if (closed) {
      return status();
    }

    stop();

    closed =
      true;

    return status();
  }

  function status() {
    return Object.freeze({
      started,
      closed,
      running,

      scheduled:
        timerHandle !==
          null,

      tick_count:
        tickCount,

      success_count:
        successCount,

      failure_count:
        failureCount,

      last_started_at_ms:
        lastStartedAtMs,

      last_finished_at_ms:
        lastFinishedAtMs,

      last_result_status:
        lastResultStatus,

      last_error_code:
        lastErrorCode
    });
  }

  return Object.freeze({
    start,
    stop,
    close,
    status
  });
}

module.exports = {
  createFabiKdsDormantWorkerV1
};
