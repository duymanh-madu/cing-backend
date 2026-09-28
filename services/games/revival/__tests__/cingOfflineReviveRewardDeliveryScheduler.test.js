"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  WORKER_KEY,
  INTERVAL_MS,
  INITIAL_DELAY_MS,
  createRewardDeliveryScheduler,
} = require(
  "../workers/cingOfflineReviveRewardDeliveryScheduler"
);

function fixture({ enabled = true, processOne } = {}) {
  const events = [];
  const timers = new Map();
  let nextTimer = 0;

  const processor = {
    processOne: processOne || (async () => ({
      processed: false,
      reason: "empty",
    })),
  };

  const scheduler = createRewardDeliveryScheduler({
    getProcessor: () => processor,
    registerScheduler: (...args) =>
      events.push(["register", ...args]),
    markSchedulerStarted: key =>
      events.push(["started", key]),
    markSchedulerSuccess: (...args) =>
      events.push(["success", ...args]),
    markSchedulerError: (...args) =>
      events.push(["error", ...args]),
    setTimeoutFn: (fn, delay) => {
      const id = ++nextTimer;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeoutFn: id => timers.delete(id),
    setIntervalFn: (fn, delay) => {
      const id = ++nextTimer;
      timers.set(id, { fn, delay });
      return id;
    },
    clearIntervalFn: id => timers.delete(id),
    isEnabled: () => enabled,
  });

  return { scheduler, events, timers };
}

test("import and construction start nothing", () => {
  const f = fixture();
  assert.deepEqual(f.events, []);
  assert.equal(f.timers.size, 0);
});

test("disabled scheduler creates no timers", () => {
  const f = fixture({ enabled: false });
  assert.equal(f.scheduler.start(), false);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.events, []);
});

test("start is idempotent and registers once", () => {
  const f = fixture();
  assert.equal(f.scheduler.start(), true);
  assert.equal(f.scheduler.start(), false);
  assert.equal(f.timers.size, 2);
  assert.deepEqual(
    [...f.timers.values()].map(x => x.delay),
    [INITIAL_DELAY_MS, INTERVAL_MS]
  );
  assert.equal(
    f.events.filter(x => x[0] === "register").length,
    1
  );
  assert.deepEqual(f.events[0][1], {
    key: WORKER_KEY,
    name: "Cing Offline Revival Reward Delivery",
    interval_ms: INTERVAL_MS,
    type: "worker",
  });
});

test("empty claim records successful empty tick", async () => {
  const f = fixture();
  f.scheduler.start();

  const result = await f.scheduler.tick();

  assert.deepEqual(result, {
    processed: false,
    reason: "empty",
  });

  const success = f.events.find(
    x => x[0] === "success"
  );
  assert.equal(success[2].empty, true);
  assert.equal(success[2].total, 0);
});

test("failed processor reports scheduler error", async () => {
  const f = fixture({
    processOne: async () => {
      throw Error("TEST_DB_ERROR");
    },
  });

  f.scheduler.start();

  await assert.rejects(
    f.scheduler.tick(),
    /TEST_DB_ERROR/
  );

  assert.equal(
    f.events.filter(x => x[0] === "error").length,
    1
  );
});

test("unfinished tick cannot overlap", async () => {
  let release;
  let calls = 0;

  const f = fixture({
    processOne: () => {
      calls++;
      return new Promise(resolve => {
        release = resolve;
      });
    },
  });

  f.scheduler.start();

  const first = f.scheduler.tick();
  const second = await f.scheduler.tick();

  assert.deepEqual(second, {
    processed: false,
    reason: "already_running",
  });
  assert.equal(calls, 1);

  release({
    processed: true,
    delivered: true,
  });

  await first;
  assert.equal(calls, 1);
});

test("stop clears timers and blocks new ticks", async () => {
  const f = fixture();
  f.scheduler.start();

  assert.equal(f.scheduler.stop(), true);
  assert.equal(f.scheduler.stop(), false);
  assert.equal(f.timers.size, 0);

  assert.deepEqual(
    await f.scheduler.tick(),
    {
      processed: false,
      reason: "not_started",
    }
  );
});
