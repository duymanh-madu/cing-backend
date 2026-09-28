"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source =
  fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../game/orderSpendPlayAwardService.js"
    ),
    "utf8"
  );

const start =
  source.indexOf(
    "async function awardProcessedCrmIposOrdersForUser("
  );

const end =
  source.indexOf(
    "module.exports = {",
    start
  );

assert.ok(
  start >= 0 &&
  end > start,
  "exact aggregate function anchors"
);

const code =
  source.slice(
    start,
    end
  );

async function exercise(
  stats,
  {
    pageSize = 10,
    error = null,
    userId =
      "0900000000",
  } = {}
) {
  const calls = [];

  const context =
    vm.createContext({
      normalizeOwner(value) {
        return String(
          value || ""
        );
      },

      async reconcileCrmRewardQueue(
        batchSize
      ) {
        calls.push(
          batchSize
        );

        if (error) {
          throw error;
        }

        return stats;
      },
    });

  vm.runInContext(
    code,
    context,
    {
      timeout: 1000,
    }
  );

  const result =
    await context
      .awardProcessedCrmIposOrdersForUser({
        user_id:
          userId,
        page_size:
          pageSize,
      });

  return {
    result,
    calls,
  };
}

test(
  "V2 recovery review is not reported as success",
  async () => {
    const {
      result,
    } =
      await exercise({
        checked: 1,
        awarded: 0,
        replayed: 0,
        skipped: 0,
        deferred: 0,
        review: 1,
      });

    assert.equal(
      result.success,
      false
    );

    assert.equal(
      result.checked,
      1
    );

    assert.equal(
      result.failed,
      1
    );

    assert.equal(
      result.review,
      1
    );
  }
);

test(
  "V2 clean recovery summary is successful",
  async () => {
    const {
      result,
    } =
      await exercise({
        checked: 3,
        awarded: 1,
        replayed: 1,
        skipped: 1,
        deferred: 0,
        review: 0,
      });

    assert.equal(
      result.success,
      true
    );

    assert.equal(
      result.checked,
      3
    );

    assert.equal(
      result.awarded,
      1
    );

    assert.equal(
      result.replayed,
      1
    );

    assert.equal(
      result.skipped,
      1
    );

    assert.equal(
      result.failed,
      0
    );
  }
);

test(
  "V2 deferred count is preserved",
  async () => {
    const {
      result,
    } =
      await exercise({
        checked: 2,
        awarded: 0,
        replayed: 0,
        skipped: 0,
        deferred: 2,
        review: 0,
      });

    assert.equal(
      result.success,
      true
    );

    assert.equal(
      result.deferred,
      2
    );
  }
);

test(
  "V2 recovery failure is never completed",
  async () => {
    const {
      result,
    } =
      await exercise(
        null,
        {
          error:
            new Error(
              "ledger unavailable"
            ),
        }
      );

    assert.equal(
      result.success,
      false
    );

    assert.equal(
      result.checked,
      0
    );

    assert.equal(
      result.failed,
      1
    );

    assert.match(
      result.error,
      /ledger unavailable/
    );
  }
);

test(
  "V2 recovery forwards bounded requested batch size",
  async () => {
    const {
      calls,
    } =
      await exercise(
        {
          checked: 0,
          awarded: 0,
          replayed: 0,
          skipped: 0,
          deferred: 0,
          review: 0,
        },
        {
          pageSize: 7,
        }
      );

    assert.deepEqual(
      calls,
      [7]
    );
  }
);

test(
  "invalid user never touches recovery authority",
  async () => {
    const {
      result,
      calls,
    } =
      await exercise(
        {
          checked: 99,
        },
        {
          userId: "",
        }
      );

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
      "invalid_user"
    );

    assert.equal(
      calls.length,
      0
    );
  }
);
