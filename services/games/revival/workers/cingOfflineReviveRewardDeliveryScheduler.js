"use strict";

/*
 * CING GAME CENTER V2 — REWARD SCHEDULER
 *
 * No timers, DB calls or scheduler
 * registration on import.
 *
 * Score Delivery remains independent.
 */

const WORKER_KEY =
  "cing_offline_revive_reward_delivery_worker";

const ENABLE_FLAG =
  "CING_OFFLINE_REVIVE_REWARD_WORKER_ENABLED";

const INTERVAL_MS = 30 * 1000;
const INITIAL_DELAY_MS = 15 * 1000;

function createRewardDeliveryScheduler({
  getProcessor,
  registerScheduler,
  markSchedulerStarted,
  markSchedulerSuccess,
  markSchedulerError,
  setTimeoutFn,
  clearTimeoutFn,
  setIntervalFn,
  clearIntervalFn,
  isEnabled,
}) {
  const dependencies = [
    getProcessor,
    registerScheduler,
    markSchedulerStarted,
    markSchedulerSuccess,
    markSchedulerError,
    setTimeoutFn,
    clearTimeoutFn,
    setIntervalFn,
    clearIntervalFn,
    isEnabled,
  ];

  if (
    dependencies.some(
      dependency =>
        typeof dependency !== "function"
    )
  ) {
    throw new Error(
      "REVIVAL_REWARD_SCHEDULER_DEPENDENCY_INVALID"
    );
  }

  let processor = null;
  let started = false;
  let running = false;
  let initialTimer = null;
  let intervalTimer = null;

  async function tick() {
    if (!started) {
      return {
        processed: false,
        reason: "not_started",
      };
    }

    if (running) {
      return {
        processed: false,
        reason: "already_running",
      };
    }

    running = true;

    try {
      const result =
        await processor.processOne();

      if (
        !result ||
        typeof result.processed !==
          "boolean"
      ) {
        throw new Error(
          "REVIVAL_REWARD_SCHEDULER_RESULT_INVALID"
        );
      }

      if (
        result.processed &&
        result.delivered !== true
      ) {
        throw new Error(
          "REVIVAL_REWARD_DELIVERY_ATTEMPT_FAILED"
        );
      }

      markSchedulerSuccess(
        WORKER_KEY,
        {
          total: result.processed ? 1 : 0,
          success:
            result.delivered === true ? 1 : 0,
          failed: 0,
          empty:
            result.processed === false &&
            result.reason === "empty",
        }
      );

      return result;

    } catch (error) {
      markSchedulerError(
        WORKER_KEY,
        error
      );

      throw error;

    } finally {
      running = false;
    }
  }

  function scheduledTick() {
    void tick().catch(() => {});
  }

  function start() {
    if (started || !isEnabled()) {
      return false;
    }

    const candidate = getProcessor();

    if (
      !candidate ||
      typeof candidate.processOne !==
        "function"
    ) {
      throw new Error(
        "REVIVAL_REWARD_SCHEDULER_PROCESSOR_INVALID"
      );
    }

    processor = candidate;

    registerScheduler({
      key: WORKER_KEY,
      name: "Cing Offline Revival Reward Delivery",
      interval_ms: INTERVAL_MS,
      type: "worker",
    });

    started = true;
    markSchedulerStarted(WORKER_KEY);

    initialTimer = setTimeoutFn(
      scheduledTick,
      INITIAL_DELAY_MS
    );

    intervalTimer = setIntervalFn(
      scheduledTick,
      INTERVAL_MS
    );

    return true;
  }

  function stop() {
    if (!started) {
      return false;
    }

    started = false;

    if (initialTimer !== null) {
      clearTimeoutFn(initialTimer);
      initialTimer = null;
    }

    if (intervalTimer !== null) {
      clearIntervalFn(intervalTimer);
      intervalTimer = null;
    }

    return true;
  }

  return {
    start,
    stop,
    tick,
  };
}


function createProductionScheduler() {
  const health = require(
    "../../../scheduler/schedulerHealthService"
  );

  return createRewardDeliveryScheduler({
    getProcessor: () => {
      const {
        createProductionProcessor,
      } = require(
        "./cingOfflineReviveRewardDeliveryWorker"
      );

      return createProductionProcessor();
    },

    registerScheduler:
      health.registerScheduler,

    markSchedulerStarted:
      health.markSchedulerStarted,

    markSchedulerSuccess:
      health.markSchedulerSuccess,

    markSchedulerError:
      health.markSchedulerError,

    setTimeoutFn: setTimeout,
    clearTimeoutFn: clearTimeout,
    setIntervalFn: setInterval,
    clearIntervalFn: clearInterval,

    isEnabled: () =>
      process.env[ENABLE_FLAG] === "true",
  });
}

module.exports = {
  WORKER_KEY,
  ENABLE_FLAG,
  INTERVAL_MS,
  INITIAL_DELAY_MS,
  createRewardDeliveryScheduler,
  createProductionScheduler,
};
