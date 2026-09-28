"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT =
  path.resolve(__dirname, "../../../..");

function read(relativePath) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8"
  );
}

function functionSource(
  source,
  begin,
  end
) {
  const start =
    source.indexOf(begin);

  assert.ok(
    start >= 0,
    `Missing start: ${begin}`
  );

  const finish =
    source.indexOf(end, start);

  assert.ok(
    finish > start,
    `Missing end: ${end}`
  );

  return source.slice(
    start,
    finish
  );
}

function loadFunction(
  code,
  name,
  dependencies
) {
  const context =
    vm.createContext({
      ...dependencies,
    });

  vm.runInContext(
    code,
    context,
    {
      filename:
        `isolated-${name}.js`,
      timeout: 1000,
    }
  );

  const handler =
    context[name];

  assert.equal(
    typeof handler,
    "function"
  );

  return handler;
}

const iposSource =
  read(
    "routes/iposWebhookRoutes.js"
  );

const commerceSource =
  read(
    "services/payment/paidOrderSettlementProcessor.js"
  );

const iposFunction =
  functionSource(
    iposSource,
    "async function awardOrderGamePlays(",
    "function extractIposOrderAmount("
  );

const commerceFunction =
  functionSource(
    commerceSource,
    "async function runReviveCreditEffectBestEffort(",
    "async function runPointsDeductEffect("
  );

test(
  "iPOS wrapper delegates exact canonical identity",
  async () => {
    const calls = [];

    const handler =
      loadFunction(
        iposFunction,
        "awardOrderGamePlays",
        {
          normalizePhone(value) {
            return String(
              value || ""
            );
          },

          require() {
            return {
              async awardGamePlaysForOrderSpend(
                args
              ) {
                calls.push(args);

                return {
                  success: true,
                };
              },
            };
          },
        }
      );

    const result =
      await handler({
        user_id:
          "0900000000",
        order_code:
          "TEST-IPOS-V2",
        amount: 50000,
      });

    assert.equal(
      result.success,
      true
    );

    assert.equal(
      calls.length,
      1
    );

    assert.equal(
      calls[0].user_id,
      "0900000000"
    );

    assert.equal(
      calls[0].order_code,
      "TEST-IPOS-V2"
    );

    assert.equal(
      calls[0].amount,
      50000
    );

    assert.equal(
      calls[0].source_context,
      "ipos_webhook"
    );
  }
);

function commerceHarness({
  result,
  error,
} = {}) {
  const calls = [];

  const handler =
    loadFunction(
      commerceFunction,
      "runReviveCreditEffectBestEffort",
      {
        async runReviveCreditEffect(
          orderId
        ) {
          calls.push(orderId);

          if (error) {
            throw error;
          }

          return result;
        },

        console: {
          log() {},
          warn() {},
        },
      }
    );

  return {
    handler,
    calls,
  };
}

test(
  "Commerce missing order identity remains bounded",
  async () => {
    const h =
      commerceHarness();

    const result =
      await h.handler(null);

    assert.equal(
      result.success,
      false
    );

    assert.equal(
      result.skipped,
      true
    );

    assert.equal(
      result.reason,
      "missing_order_id"
    );

    assert.equal(
      h.calls.length,
      0
    );
  }
);

test(
  "Commerce executes Revive Credit effect once",
  async () => {
    const h =
      commerceHarness({
        result: {
          success: true,
          executed: true,
        },
      });

    const result =
      await h.handler({
        id: 377,
        order_code:
          "TEST-COMMERCE-V2",
      });

    assert.equal(
      result.success,
      true
    );

    assert.equal(
      result.executed,
      true
    );

    assert.deepEqual(
      h.calls,
      [377]
    );
  }
);

test(
  "Commerce effect failure never reports success",
  async () => {
    const h =
      commerceHarness({
        error:
          new Error(
            "SIMULATED_BRIDGE_FAILURE"
          ),
      });

    const result =
      await h.handler({
        id: 377,
        order_code:
          "TEST-COMMERCE-V2",
      });

    assert.equal(
      result.success,
      false
    );

    assert.equal(
      result.failed,
      true
    );

    assert.match(
      result.error,
      /SIMULATED_BRIDGE_FAILURE/
    );

    assert.equal(
      h.calls.length,
      1
    );
  }
);
