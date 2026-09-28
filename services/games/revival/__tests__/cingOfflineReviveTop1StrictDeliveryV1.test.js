"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../..");

const source = fs.readFileSync(
  path.join(
    ROOT,
    "services/leaderboardResetService.js"
  ),
  "utf8"
);

const start = source.indexOf(
  "async function checkAndNotifyTop1Changes("
);

const end = source.indexOf(
  "\nmodule.exports =",
  start
);

assert.ok(start >= 0);
assert.ok(end > start);

const top1 = source.slice(start, end);

test(
  "strict mode is opt-in",
  () => {
    assert.match(
      top1,
      /throwOnError\s*=\s*false/
    );

    assert.match(
      top1,
      /strictDelivery\s*=\s*false/
    );
  }
);

test(
  "strict mode validates app configuration",
  () => {
    assert.match(
      top1,
      /cfgError\s*\|\|\s*!cfg/
    );

    assert.match(
      top1,
      /TOP1_CONFIG_UNAVAILABLE/
    );
  }
);

test(
  "all three board query failures propagate",
  () => {
    assert.equal(
      (
        top1.match(
          /if \(strictDelivery\) throw error;/g
        ) || []
      ).length,
      3
    );
  }
);

test(
  "player lookup failure propagates",
  () => {
    assert.match(
      top1,
      /strictDelivery && playerError/
    );
  }
);

test(
  "both cache update branches are checked",
  () => {
    assert.equal(
      (
        top1.match(
          /strictDelivery && cacheError/g
        ) || []
      ).length,
      2
    );
  }
);

test(
  "missing IO rejects strict delivery",
  () => {
    assert.match(
      top1,
      /TOP1_IO_UNAVAILABLE/
    );
  }
);

test(
  "failed broadcast rejects strict delivery",
  () => {
    assert.match(
      top1,
      /if \(strictDelivery\)\s*\{\s*throw emitErr;/
    );

    assert.match(
      top1,
      /TOP1_BROADCAST_INCOMPLETE/
    );
  }
);

test(
  "no-notification and broadcast paths verify success",
  () => {
    assert.equal(
      (
        top1.match(
          /verified:\s*true/g
        ) || []
      ).length,
      2
    );

    assert.match(
      top1,
      /notifications_count:\s*notifications\.length/
    );
  }
);

test(
  "strict exceptions reach caller",
  () => {
    assert.match(
      top1,
      /throwOnError \|\| strictDelivery/
    );
  }
);

test(
  "legacy Top1 event and baseline are preserved",
  () => {
    assert.match(
      top1,
      /notification\.broadcast/
    );

    assert.match(
      top1,
      /leaderboard\.top1_changed/
    );

    assert.match(
      top1,
      /Baseline cache set/
    );
  }
);
