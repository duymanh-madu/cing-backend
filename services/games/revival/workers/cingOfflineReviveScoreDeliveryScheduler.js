"use strict";

/*
 * CING GAME CENTER V2
 *
 * Offline Revival Score Delivery Scheduler.
 *
 * Importing this module does not:
 * - instantiate the production processor
 * - start timers
 * - register scheduler health
 * - connect to PostgreSQL
 * - perform score delivery
 *
 * Only an explicit start() with the exact
 * enable flag "true" may activate it.
 */

const WORKER_KEY =
  "cing_offline_revive_score_delivery_worker";

const ENABLE_FLAG =
  "CING_OFFLINE_REVIVE_SCORE_DELIVERY_WORKER_ENABLED";

const INTERVAL_MS = 30 * 1000;

const INITIAL_DELAY_MS = 15 * 1000;

function createScoreDeliveryScheduler({
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
  for (const dependency of [
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
  ]) {
    if (
      typeof dependency !== "function"
    ) {
      throw new Error(
        "REVIVAL_SCORE_SCHEDULER_DEPENDENCY_INVALID"
      );
    }
  }

  let processor = null;
  let initialTimer = null;
  let intervalTimer = null;

  let started = false;
  let running = false;

  async function tick() {
    if (!started) {
      return {
        processed: false,
        reason: "not_started",
      };
    }

    /*
     * PostgreSQL protects cross-instance
     * claims through SKIP LOCKED.
     *
     * This guard separately prevents
     * overlapping ticks in one process.
     */

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
          "REVIVAL_SCORE_SCHEDULER_RESULT_INVALID"
        );
      }

      if (
        result.processed === true &&
        result.delivered !== true
      ) {
        throw new Error(
          "REVIVAL_SCORE_DELIVERY_ATTEMPT_FAILED"
        );
      }

      const stats = {
        total:
          result.processed ? 1 : 0,

        success:
          result.delivered === true ? 1 : 0,

        failed: 0,

        empty:
          result.processed === false &&
          result.reason === "empty",
      };

      markSchedulerSuccess(
        WORKER_KEY,
        stats
      );

      return {
        ...result,
        stats,
      };

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
    /*
     * tick() already records the
     * scheduler error.
     *
     * Timer callbacks must not produce
     * unhandled promise rejections.
     */

    void tick().catch(
      () => {}
    );
  }

  function start() {
    if (started) {
      return false;
    }

    if (!isEnabled()) {
      return false;
    }

    /*
     * Processor construction precedes
     * scheduler registration and timers.
     *
     * A missing dependency must not
     * leave a registered, inert worker.
     */

    const nextProcessor =
      getProcessor();

    if (
      !nextProcessor ||
      typeof nextProcessor.processOne !==
        "function"
    ) {
      throw new Error(
        "REVIVAL_SCORE_PROCESSOR_INVALID"
      );
    }

    processor =
      nextProcessor;

    registerScheduler({
      key: WORKER_KEY,

      name:
        "Cing Offline Revival Score Delivery",

      interval_ms:
        INTERVAL_MS,

      type:
        "worker",
    });

    markSchedulerStarted(
      WORKER_KEY
    );

    started = true;

    initialTimer =
      setTimeoutFn(
        scheduledTick,
        INITIAL_DELAY_MS
      );

    intervalTimer =
      setIntervalFn(
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
      clearTimeoutFn(
        initialTimer
      );

      initialTimer = null;
    }

    if (intervalTimer !== null) {
      clearIntervalFn(
        intervalTimer
      );

      intervalTimer = null;
    }

    /*
     * Never interrupt an active
     * PostgreSQL lease directly.
     *
     * The in-flight processor completes
     * or PostgreSQL later reclaims it.
     */

    return true;
  }

  function getState() {
    return {
      started,
      running,

      interval_ms:
        INTERVAL_MS,

      worker_key:
        WORKER_KEY,
    };
  }

  return {
    start,
    stop,
    tick,
    getState,
  };
}

/*
 * Lazy runtime wiring.
 *
 * No production dependency is loaded
 * merely by importing this module.
 */

function createProductionScheduler() {
  const {
    createProductionProcessor,
  } = require(
    "./cingOfflineReviveScoreDeliveryWorker"
  );

  const health = require(
    "../../../scheduler/schedulerHealthService"
  );

  return createScoreDeliveryScheduler({
    getProcessor:
      createProductionProcessor,

    registerScheduler:
      health.registerScheduler,

    markSchedulerStarted:
      health.markSchedulerStarted,

    markSchedulerSuccess:
      health.markSchedulerSuccess,

    markSchedulerError:
      health.markSchedulerError,

    setTimeoutFn:
      setTimeout,

    clearTimeoutFn:
      clearTimeout,

    setIntervalFn:
      setInterval,

    clearIntervalFn:
      clearInterval,

    isEnabled() {
      return (
        process.env[
          ENABLE_FLAG
        ] === "true"
      );
    },
  });
}

module.exports = {
  createScoreDeliveryScheduler,
  createProductionScheduler,
};
