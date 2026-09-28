"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createScoreDeliveryScheduler,
} = require(
  "../workers/cingOfflineReviveScoreDeliveryScheduler"
);

function fixture(options = {}) {
  const calls = [];

  const timers = {
    timeout: null,
    interval: null,
  };

  let enabled =
    options.enabled ?? true;

  let processOne =
    options.processOne ||
    (async () => ({
      processed: false,
      reason: "empty",
    }));

  const scheduler =
    createScoreDeliveryScheduler({
      getProcessor() {
        calls.push(
          "create_processor"
        );

        return {
          processOne(
            ...args
          ) {
            calls.push(
              "process_one"
            );

            return processOne(
              ...args
            );
          },
        };
      },

      registerScheduler(info) {
        calls.push([
          "register",
          info,
        ]);
      },

      markSchedulerStarted(key) {
        calls.push([
          "started",
          key,
        ]);
      },

      markSchedulerSuccess(
        key,
        stats
      ) {
        calls.push([
          "success",
          key,
          stats,
        ]);
      },

      markSchedulerError(
        key,
        error
      ) {
        calls.push([
          "error",
          key,
          error.message,
        ]);
      },

      setTimeoutFn(
        callback,
        delay
      ) {
        timers.timeout = {
          callback,
          delay,
        };

        return 1;
      },

      clearTimeoutFn(id) {
        calls.push([
          "clear_timeout",
          id,
        ]);
      },

      setIntervalFn(
        callback,
        delay
      ) {
        timers.interval = {
          callback,
          delay,
        };

        return 2;
      },

      clearIntervalFn(id) {
        calls.push([
          "clear_interval",
          id,
        ]);
      },

      isEnabled() {
        return enabled;
      },
    });

  return {
    scheduler,
    calls,
    timers,

    setEnabled(value) {
      enabled = value;
    },

    setProcessOne(value) {
      processOne = value;
    },
  };
}

function count(calls, name) {
  return calls.filter(
    item =>
      Array.isArray(item)
        ? item[0] === name
        : item === name
  ).length;
}

test(
  "scheduler construction has zero side effects",
  () => {
    const f =
      fixture();

    assert.deepEqual(
      f.calls,
      []
    );

    assert.equal(
      f.timers.timeout,
      null
    );

    assert.equal(
      f.timers.interval,
      null
    );

    assert.equal(
      f.scheduler.getState()
        .started,
      false
    );
  }
);

test(
  "disabled worker neither loads processor nor registers",
  async () => {
    const f =
      fixture({
        enabled: false,
      });

    assert.equal(
      f.scheduler.start(),
      false
    );

    assert.equal(
      count(
        f.calls,
        "create_processor"
      ),
      0
    );

    assert.equal(
      count(
        f.calls,
        "register"
      ),
      0
    );

    assert.equal(
      f.timers.interval,
      null
    );

    const result =
      await f.scheduler.tick();

    assert.equal(
      result.reason,
      "not_started"
    );
  }
);

test(
  "explicit start registers exactly one worker",
  () => {
    const f =
      fixture();

    assert.equal(
      f.scheduler.start(),
      true
    );

    assert.equal(
      f.scheduler.start(),
      false
    );

    assert.equal(
      count(
        f.calls,
        "create_processor"
      ),
      1
    );

    assert.equal(
      count(
        f.calls,
        "register"
      ),
      1
    );

    const registration =
      f.calls.find(
        item =>
          Array.isArray(item) &&
          item[0] === "register"
      )[1];

    assert.equal(
      registration.key,
      "cing_offline_revive_score_delivery_worker"
    );

    assert.equal(
      registration.interval_ms,
      30000
    );

    assert.equal(
      f.timers.timeout.delay,
      15000
    );

    assert.equal(
      f.timers.interval.delay,
      30000
    );

    assert.equal(
      f.scheduler.stop(),
      true
    );
  }
);

test(
  "empty queue records healthy zero-work tick",
  async () => {
    const f =
      fixture();

    f.scheduler.start();

    const result =
      await f.scheduler.tick();

    assert.equal(
      result.processed,
      false
    );

    assert.deepEqual(
      result.stats,
      {
        total: 0,
        success: 0,
        failed: 0,
        empty: true,
      }
    );

    assert.equal(
      count(
        f.calls,
        "success"
      ),
      1
    );

    f.scheduler.stop();
  }
);

test(
  "delivered job records one successful delivery",
  async () => {
    const f =
      fixture({
        processOne:
          async () => ({
            processed: true,
            delivered: true,
            score_id: "123",
          }),
      });

    f.scheduler.start();

    const result =
      await f.scheduler.tick();

    assert.equal(
      result.stats.total,
      1
    );

    assert.equal(
      result.stats.success,
      1
    );

    assert.equal(
      count(
        f.calls,
        "error"
      ),
      0
    );

    f.scheduler.stop();
  }
);

test(
  "recorded delivery failure marks scheduler error",
  async () => {
    const f =
      fixture({
        processOne:
          async () => ({
            processed: true,
            delivered: false,
            failure_recorded:
              true,
          }),
      });

    f.scheduler.start();

    await assert.rejects(
      f.scheduler.tick(),
      /REVIVAL_SCORE_DELIVERY_ATTEMPT_FAILED/
    );

    assert.equal(
      count(
        f.calls,
        "success"
      ),
      0
    );

    assert.equal(
      count(
        f.calls,
        "error"
      ),
      1
    );

    f.scheduler.stop();
  }
);

test(
  "claim exception marks scheduler error",
  async () => {
    const f =
      fixture({
        processOne:
          async () => {
            throw new Error(
              "claim unavailable"
            );
          },
      });

    f.scheduler.start();

    await assert.rejects(
      f.scheduler.tick(),
      /claim unavailable/
    );

    assert.equal(
      count(
        f.calls,
        "error"
      ),
      1
    );

    f.scheduler.stop();
  }
);

test(
  "single flight skips overlapping tick",
  async () => {
    let resolveFirst;

    const first =
      new Promise(resolve => {
        resolveFirst = resolve;
      });

    const f =
      fixture({
        processOne() {
          return first;
        },
      });

    f.scheduler.start();

    const inFlight =
      f.scheduler.tick();

    const overlapping =
      await f.scheduler.tick();

    assert.equal(
      overlapping.reason,
      "already_running"
    );

    assert.equal(
      count(
        f.calls,
        "process_one"
      ),
      1
    );

    resolveFirst({
      processed: false,
      reason: "empty",
    });

    await inFlight;

    assert.equal(
      f.scheduler.getState()
        .running,
      false
    );

    f.scheduler.stop();
  }
);

test(
  "stop clears timers and prevents later ticks",
  async () => {
    const f =
      fixture();

    f.scheduler.start();

    assert.equal(
      f.scheduler.stop(),
      true
    );

    assert.equal(
      f.scheduler.stop(),
      false
    );

    assert.equal(
      count(
        f.calls,
        "clear_timeout"
      ),
      1
    );

    assert.equal(
      count(
        f.calls,
        "clear_interval"
      ),
      1
    );

    const result =
      await f.scheduler.tick();

    assert.equal(
      result.reason,
      "not_started"
    );
  }
);

test(
  "worker may start only after explicitly enabled",
  () => {
    const f =
      fixture({
        enabled: false,
      });

    assert.equal(
      f.scheduler.start(),
      false
    );

    f.setEnabled(true);

    assert.equal(
      f.scheduler.start(),
      true
    );

    f.scheduler.stop();
  }
);

test(
  "invalid processor cannot register scheduler",
  () => {
    const calls = [];

    const scheduler =
      createScoreDeliveryScheduler({
        getProcessor() {
          return {};
        },

        registerScheduler() {
          calls.push(
            "register"
          );
        },

        markSchedulerStarted() {},

        markSchedulerSuccess() {},

        markSchedulerError() {},

        setTimeoutFn() {},

        clearTimeoutFn() {},

        setIntervalFn() {},

        clearIntervalFn() {},

        isEnabled() {
          return true;
        },
      });

    assert.throws(
      () => scheduler.start(),
      /REVIVAL_SCORE_PROCESSOR_INVALID/
    );

    assert.deepEqual(
      calls,
      []
    );
  }
);
