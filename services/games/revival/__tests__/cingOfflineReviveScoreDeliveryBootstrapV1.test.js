"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SERVER_SOURCE =
  fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../../server.js"
    ),
    "utf8"
  );

const START = `/**
 * =====================================================
 * CING OFFLINE REVIVAL SCORE DELIVERY WORKER`;

const END = `/**
 * =====================================================
 * CING WALLET TOP-UP RECONCILIATION WORKER`;

assert.equal(
  SERVER_SOURCE.split(START).length,
  2,
  "Score Delivery bootstrap must occur once"
);

assert.equal(
  SERVER_SOURCE.split(END).length,
  2,
  "Wallet bootstrap anchor must occur once"
);

const start =
  SERVER_SOURCE.indexOf(START);

const end =
  SERVER_SOURCE.indexOf(
    END,
    start
  );

assert.ok(
  end > start,
  "Score Delivery must precede Wallet bootstrap"
);

const BOOTSTRAP =
  SERVER_SOURCE.slice(
    start,
    end
  );

const EXPECTED_MODULE =
  "./services/games/revival/workers/" +
  "cingOfflineReviveScoreDeliveryScheduler";

function runBootstrap({
  flag,
  throwOnRequire = false,
  throwOnCreate = false,
  throwOnStart = false,
} = {}) {
  const calls = [];

  let registered = false;
  let timerCreated = false;

  const scheduler = {
    start() {
      calls.push("start");

      if (throwOnStart) {
        throw new Error(
          "scheduler start failed"
        );
      }

      registered = true;
      timerCreated = true;

      return true;
    },
  };

  const context = {
    process: {
      env: {
        CING_OFFLINE_REVIVE_SCORE_DELIVERY_WORKER_ENABLED:
          flag,
      },
    },

    require(request) {
      calls.push([
        "require",
        request,
      ]);

      assert.equal(
        request,
        EXPECTED_MODULE
      );

      if (throwOnRequire) {
        throw new Error(
          "scheduler import failed"
        );
      }

      return {
        createProductionScheduler() {
          calls.push(
            "create"
          );

          if (throwOnCreate) {
            throw new Error(
              "processor initialization failed"
            );
          }

          return scheduler;
        },
      };
    },

    console: {
      warn(...args) {
        calls.push([
          "warning",
          args.map(
            value =>
              String(value)
          ),
        ]);
      },
    },
  };

  vm.runInNewContext(
    BOOTSTRAP,
    context,
    {
      filename:
        "server.js:score-delivery-bootstrap",
    }
  );

  return {
    calls,
    registered,
    timerCreated,
  };
}

function actionNames(calls) {
  return calls.map(
    entry =>
      Array.isArray(entry)
        ? entry[0]
        : entry
  );
}

test(
  "absent flag performs no import or startup",
  () => {
    const result =
      runBootstrap();

    assert.deepEqual(
      result.calls,
      []
    );

    assert.equal(
      result.registered,
      false
    );

    assert.equal(
      result.timerCreated,
      false
    );
  }
);

test(
  "false flag performs no import or startup",
  () => {
    const result =
      runBootstrap({
        flag: "false",
      });

    assert.deepEqual(
      result.calls,
      []
    );

    assert.equal(
      result.registered,
      false
    );

    assert.equal(
      result.timerCreated,
      false
    );
  }
);

test(
  "only exact true string enables bootstrap",
  () => {
    for (const flag of [
      "TRUE",
      "True",
      "1",
      "yes",
      " true",
      "true ",
      "",
    ]) {
      const result =
        runBootstrap({
          flag,
        });

      assert.deepEqual(
        result.calls,
        [],
        `unexpected startup for ${JSON.stringify(flag)}`
      );
    }
  }
);

test(
  "true flag imports and starts exactly once",
  () => {
    const result =
      runBootstrap({
        flag: "true",
      });

    assert.deepEqual(
      actionNames(
        result.calls
      ),
      [
        "require",
        "create",
        "start",
      ]
    );

    assert.equal(
      result.registered,
      true
    );

    assert.equal(
      result.timerCreated,
      true
    );
  }
);

test(
  "import failure is contained in bootstrap",
  () => {
    const result =
      runBootstrap({
        flag: "true",
        throwOnRequire:
          true,
      });

    assert.deepEqual(
      actionNames(
        result.calls
      ),
      [
        "require",
        "warning",
      ]
    );

    assert.equal(
      result.registered,
      false
    );
  }
);

test(
  "processor construction failure is contained",
  () => {
    const result =
      runBootstrap({
        flag: "true",
        throwOnCreate:
          true,
      });

    assert.deepEqual(
      actionNames(
        result.calls
      ),
      [
        "require",
        "create",
        "warning",
      ]
    );

    assert.equal(
      result.registered,
      false
    );
  }
);

test(
  "scheduler startup failure is contained",
  () => {
    const result =
      runBootstrap({
        flag: "true",
        throwOnStart:
          true,
      });

    assert.deepEqual(
      actionNames(
        result.calls
      ),
      [
        "require",
        "create",
        "start",
        "warning",
      ]
    );

    assert.equal(
      result.registered,
      false
    );
  }
);

test(
  "bootstrap is isolated between existing workers",
  () => {
    const previous =
      "./services/games/cingBlockPuzzle/" +
      "workers/cingBlockPuzzleSubmitTop1Worker";

    const next =
      "./services/payment/workers/" +
      "walletTopupReconciliationWorker";

    assert.ok(
      SERVER_SOURCE.indexOf(
        previous
      ) < start
    );

    assert.ok(
      end < SERVER_SOURCE.indexOf(
        next
      )
    );

    assert.equal(
      SERVER_SOURCE.split(
        EXPECTED_MODULE
      ).length,
      2
    );
  }
);
