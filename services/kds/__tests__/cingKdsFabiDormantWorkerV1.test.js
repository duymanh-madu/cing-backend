"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  createFabiKdsDormantWorkerV1
} = require(
  "../cingKdsFabiDormantWorkerV1"
);

function harness(
  overrides = {}
) {
  const timers =
    new Map();

  const cancelled = [];

  let nextHandle =
    1;

  let now =
    1000;

  let runCalls =
    0;

  const runtime = {
    runOnce:
      async () => {
        runCalls++;

        return {
          status:
            "committed"
        };
      },

    status:
      () => ({
        running:
          false
      })
  };

  const deps = {
    runtime,

    scheduleTimer:
      (fn, delay) => {
        const handle =
          nextHandle++;

        timers.set(
          handle,
          {
            fn,
            delay
          }
        );

        return handle;
      },

    cancelTimer:
      handle => {
        cancelled.push(
          handle
        );

        timers.delete(
          handle
        );
      },

    nowProvider:
      async () =>
        now++,

    intervalMs:
      5000,

    initialDelayMs:
      0,

    ...overrides
  };

  async function fire(
    handle
  ) {
    const timer =
      timers.get(
        handle
      );

    assert.ok(
      timer,
      `missing timer ${handle}`
    );

    timers.delete(
      handle
    );

    timer.fn();

    /*
     * Flush async executionTick promise chain.
     */
    await new Promise(
      resolve =>
        setImmediate(resolve)
    );

    await new Promise(
      resolve =>
        setImmediate(resolve)
    );
  }

  return {
    deps,
    runtime,
    timers,
    cancelled,

    getRunCalls:
      () =>
        runCalls,

    fire
  };
}

test(
  "construction performs zero scheduling and zero runtime I/O",
  () => {
    const h =
      harness();

    const worker =
      createFabiKdsDormantWorkerV1(
        h.deps
      );

    assert.equal(
      h.timers.size,
      0
    );

    assert.equal(
      h.getRunCalls(),
      0
    );

    assert.equal(
      worker.status()
        .started,
      false
    );
  }
);

test(
  "start schedules exactly one initial tick",
  () => {
    const h =
      harness();

    const worker =
      createFabiKdsDormantWorkerV1(
        h.deps
      );

    const status =
      worker.start();

    assert.equal(
      status.started,
      true
    );

    assert.equal(
      status.scheduled,
      true
    );

    assert.equal(
      h.timers.size,
      1
    );

    const timer =
      [...h.timers.values()][0];

    assert.equal(
      timer.delay,
      0
    );
  }
);

test(
  "tick executes one run and schedules next only after completion",
  async () => {
    let releaseRun;

    const runGate =
      new Promise(resolve => {
        releaseRun =
          resolve;
      });

    const h =
      harness({
        runtime: {
          runOnce:
            async () => {
              await runGate;

              return {
                status:
                  "committed"
              };
            },

          status:
            () => ({
              running:
                false
            })
        }
      });

    const worker =
      createFabiKdsDormantWorkerV1(
        h.deps
      );

    worker.start();

    const firstHandle =
      [...h.timers.keys()][0];

    const timer =
      h.timers.get(
        firstHandle
      );

    h.timers.delete(
      firstHandle
    );

    timer.fn();

    await new Promise(
      resolve =>
        setImmediate(resolve)
    );

    assert.equal(
      worker.status()
        .running,
      true
    );

    assert.equal(
      h.timers.size,
      0
    );

    releaseRun();

    await new Promise(
      resolve =>
        setImmediate(resolve)
    );

    await new Promise(
      resolve =>
        setImmediate(resolve)
    );

    assert.equal(
      worker.status()
        .running,
      false
    );

    assert.equal(
      h.timers.size,
      1
    );

    const nextTimer =
      [...h.timers.values()][0];

    assert.equal(
      nextTimer.delay,
      5000
    );
  }
);

test(
  "successful tick updates health counters without secret payloads",
  async () => {
    const h =
      harness();

    const worker =
      createFabiKdsDormantWorkerV1(
        h.deps
      );

    worker.start();

    await h.fire(
      [...h.timers.keys()][0]
    );

    const status =
      worker.status();

    assert.equal(
      status.tick_count,
      1
    );

    assert.equal(
      status.success_count,
      1
    );

    assert.equal(
      status.failure_count,
      0
    );

    assert.equal(
      status.last_result_status,
      "committed"
    );

    assert.equal(
      status.last_error_code,
      null
    );

    assert.equal(
      typeof status
        .last_started_at_ms,
      "number"
    );

    assert.equal(
      typeof status
        .last_finished_at_ms,
      "number"
    );
  }
);

test(
  "failed runtime tick is contained and retry is rescheduled",
  async () => {
    const h =
      harness({
        runtime: {
          runOnce:
            async () => {
              const error =
                new Error(
                  "SECRET_UPSTREAM_MESSAGE"
                );

              error.code =
                "FABi_TEMPORARY_FAILURE";

              throw error;
            },

          status:
            () => ({
              running:
                false
            })
        }
      });

    const worker =
      createFabiKdsDormantWorkerV1(
        h.deps
      );

    worker.start();

    await h.fire(
      [...h.timers.keys()][0]
    );

    const status =
      worker.status();

    assert.equal(
      status.failure_count,
      1
    );

    assert.equal(
      status.success_count,
      0
    );

    assert.equal(
      status.last_error_code,
      "FABi_TEMPORARY_FAILURE"
    );

    assert.equal(
      JSON.stringify(status)
        .includes(
          "SECRET_UPSTREAM_MESSAGE"
        ),
      false
    );

    assert.equal(
      h.timers.size,
      1
    );
  }
);

test(
  "stop cancels pending timer",
  () => {
    const h =
      harness();

    const worker =
      createFabiKdsDormantWorkerV1(
        h.deps
      );

    worker.start();

    const handle =
      [...h.timers.keys()][0];

    worker.stop();

    assert.deepEqual(
      h.cancelled,
      [
        handle
      ]
    );

    assert.equal(
      h.timers.size,
      0
    );

    assert.equal(
      worker.status()
        .started,
      false
    );
  }
);

test(
  "stop during in-flight run prevents future reschedule",
  async () => {
    let releaseRun;

    const gate =
      new Promise(resolve => {
        releaseRun =
          resolve;
      });

    const h =
      harness({
        runtime: {
          runOnce:
            async () => {
              await gate;

              return {
                status:
                  "committed"
              };
            },

          status:
            () => ({
              running:
                false
            })
        }
      });

    const worker =
      createFabiKdsDormantWorkerV1(
        h.deps
      );

    worker.start();

    const handle =
      [...h.timers.keys()][0];

    const timer =
      h.timers.get(
        handle
      );

    h.timers.delete(
      handle
    );

    timer.fn();

    await new Promise(
      resolve =>
        setImmediate(resolve)
    );

    assert.equal(
      worker.status()
        .running,
      true
    );

    worker.stop();

    releaseRun();

    await new Promise(
      resolve =>
        setImmediate(resolve)
    );

    await new Promise(
      resolve =>
        setImmediate(resolve)
    );

    assert.equal(
      worker.status()
        .running,
      false
    );

    assert.equal(
      h.timers.size,
      0
    );
  }
);

test(
  "double start is rejected",
  () => {
    const h =
      harness();

    const worker =
      createFabiKdsDormantWorkerV1(
        h.deps
      );

    worker.start();

    assert.throws(
      () =>
        worker.start(),
      /KDS_WORKER_ALREADY_STARTED/
    );
  }
);

test(
  "close permanently blocks restart",
  () => {
    const h =
      harness();

    const worker =
      createFabiKdsDormantWorkerV1(
        h.deps
      );

    worker.start();
    worker.close();

    assert.equal(
      worker.status()
        .closed,
      true
    );

    assert.throws(
      () =>
        worker.start(),
      /KDS_WORKER_CLOSED/
    );
  }
);

test(
  "worker public surface has lifecycle only",
  () => {
    const h =
      harness();

    const worker =
      createFabiKdsDormantWorkerV1(
        h.deps
      );

    assert.deepEqual(
      Object.keys(worker)
        .sort(),
      [
        "close",
        "start",
        "status",
        "stop"
      ]
    );

    assert.equal(
      worker.listen,
      undefined
    );

    assert.equal(
      worker.mount,
      undefined
    );

    assert.equal(
      worker.deploy,
      undefined
    );
  }
);

test(
  "worker source owns no concrete environment server or timer primitive",
  () => {
    const fs =
      require("node:fs");

    const source =
      fs.readFileSync(
        "services/kds/cingKdsFabiDormantWorkerV1.js",
        "utf8"
      );

    const executable =
      source
        .replace(
          /\/\*[\s\S]*?\*\//g,
          ""
        )
        .replace(
          /\/\/.*$/gm,
          ""
        );

    assert.doesNotMatch(
      executable,
      /\bprocess\.env\b/
    );

    assert.doesNotMatch(
      executable,
      /\bsetInterval\s*\(/
    );

    assert.doesNotMatch(
      executable,
      /\bsetTimeout\s*\(/
    );

    assert.doesNotMatch(
      executable,
      /\bserver\.listen\s*\(/
    );

    assert.doesNotMatch(
      executable,
      /\bapp\.listen\s*\(/
    );
  }
);
