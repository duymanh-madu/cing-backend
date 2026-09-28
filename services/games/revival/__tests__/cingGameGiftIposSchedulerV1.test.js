"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const worker = fs.readFileSync(
  path.join(
    __dirname,
    "../cingGameGiftIposSyncWorker.js"
  ),
  "utf8"
);

const server = fs.readFileSync(
  path.join(
    __dirname,
    "../../../..",
    "server.js"
  ),
  "utf8"
);

const begin = worker.indexOf(
  "/*\n * CING_GAME_GIFT_IPOS_SCHEDULER_V1"
);

const end = worker.indexOf(
  "module.exports = {",
  begin
);

assert.ok(begin >= 0);
assert.ok(end > begin);

/*
 * Execute the actual scheduler function source
 * with mocked queue and clock.
 *
 * No worker dependencies are imported.
 * No network or database is available.
 */
const schedulerSource =
  worker.slice(begin, end);

function makeHarness(enabled) {
  const wakeups = [];
  const intervals = [];
  const queueCalls = [];
  const warnings = [];

  const context = {
    process: {
      env: {
        CING_GAME_GIFT_IPOS_SYNC_WORKER_ENABLED:
          enabled ? "true" : "false",
      },
    },

    ENABLE_FLAG:
      "CING_GAME_GIFT_IPOS_SYNC_WORKER_ENABLED",

    processCingGameGiftIposSyncQueue(options) {
      queueCalls.push(options);

      return Promise.resolve({
        success: true,
        stats: {
          success: 0,
          failed: 0,
        },
      });
    },

    setTimeout(callback, ms) {
      const timer = {
        callback,
        ms,
        unref() {},
      };

      wakeups.push(timer);
      return timer;
    },

    setInterval(callback, ms) {
      const timer = {
        callback,
        ms,
        unref() {},
      };

      intervals.push(timer);
      return timer;
    },

    console: {
      warn(...args) {
        warnings.push(args);
      },
    },

    Promise,
  };

  vm.runInNewContext(
    schedulerSource,
    context,
    {
      filename:
        "cingGameGiftIposSchedulerV1.vm.js",
    }
  );

  return {
    start: vm.runInNewContext(
      "startCingGameGiftIposSyncWorker",
      context
    ),
    wakeups,
    intervals,
    queueCalls,
    warnings,
  };
}

async function flush() {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

test(
  "OFF never schedules or processes Gift points",
  () => {
    const h = makeHarness(false);

    assert.equal(
      h.start(),
      false
    );

    assert.equal(
      h.wakeups.length,
      0
    );

    assert.equal(
      h.intervals.length,
      0
    );

    assert.equal(
      h.queueCalls.length,
      0
    );
  }
);

test(
  "enabled starter schedules bounded wakeups",
  () => {
    const h = makeHarness(true);

    assert.equal(
      h.start(),
      true
    );

    assert.equal(
      h.wakeups.length,
      1
    );

    assert.equal(
      h.wakeups[0].ms,
      45000
    );

    assert.equal(
      h.intervals.length,
      1
    );

    assert.equal(
      h.intervals[0].ms,
      60000
    );

    assert.equal(
      h.queueCalls.length,
      0
    );
  }
);

test(
  "duplicate starter does not create more timers",
  () => {
    const h = makeHarness(true);

    assert.equal(
      h.start(),
      true
    );

    assert.equal(
      h.start(),
      false
    );

    assert.equal(
      h.wakeups.length,
      1
    );

    assert.equal(
      h.intervals.length,
      1
    );
  }
);

test(
  "scheduled wakeup calls existing queue",
  async () => {
    const h = makeHarness(true);

    h.start();

    h.wakeups[0].callback();

    await flush();

    assert.equal(
      h.queueCalls.length,
      1
    );

    assert.equal(
      h.queueCalls[0].batchSize,
      10
    );

    h.intervals[0].callback();

    await flush();

    assert.equal(
      h.queueCalls.length,
      2
    );

    assert.equal(
      h.warnings.length,
      0
    );
  }
);

test(
  "server never imports Gift Worker when OFF",
  () => {
    const marker = server.indexOf(
      "CING_GAME_GIFT_IPOS_BOOTSTRAP_V1"
    );

    assert.ok(marker >= 0);

    const section = server.slice(
      marker,
      server.indexOf(
        "CING BLOCK PUZZLE SUBMIT TOP1 WORKER",
        marker
      )
    );

    assert.match(
      section,
      /CING_GAME_GIFT_IPOS_SYNC_WORKER_ENABLED\s*===\s*"true"/
    );

    assert.match(
      section,
      /require\(\s*"\.\/services\/games\/revival\/cingGameGiftIposSyncWorker"/
    );

    assert.match(
      section,
      /startCingGameGiftIposSyncWorker\(\)/
    );
  }
);

test(
  "Gift SQL permissions are not activated",
  () => {
    assert.doesNotMatch(
      schedulerSource,
      /grant\s+execute/i
    );

    assert.doesNotMatch(
      server,
      /CING_GAME_GIFT_V2_CUTOVER_ENABLED\s*=\s*"true"/
    );
  }
);
