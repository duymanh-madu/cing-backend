const assert =
  require("node:assert/strict");

const {
  test,
} = require("node:test");

const {
  V5_CREDIT_COSTS,
  normalizeV5ReviveSessionRow,
  normalizeV5ReviveResult,
} = require(
  "../domain/cingBlockPuzzleV5ReviveContracts"
);

const SESSION_ID =
  "11111111-1111-4111-8111-111111111111";

const PURCHASE_ID =
  "22222222-2222-4222-8222-222222222222";

const FINGERPRINT =
  "a".repeat(64);

function session(
  overrides = {}
) {
  return {
    id: SESSION_ID,
    user_id: "v5-test-user",
    game_key: "cing-block-puzzle",
    seed: 12345,
    engine_version: 4,
    rules_version: 4,
    score_version: 3,
    replay_version: 5,
    status: "active",
    expires_at:
      "2030-01-01T00:00:00.000Z",
    continue_count: 0,
    ...overrides,
  };
}

function receipt(
  overrides = {}
) {
  return {
    purchase_id: PURCHASE_ID,
    session_id: SESSION_ID,
    continue_index: 1,
    credit_cost: 1,
    credit_transaction_id: "123",
    balance_before: 31,
    balance_after: 30,
    continue_count: 1,
    verified_replay_fingerprint:
      FINGERPRINT,
    created_at:
      "2026-09-25T00:00:00.000Z",
    idempotent: false,
    ...overrides,
  };
}

test(
  "V5 exact session tuple accepted",
  () => {
    const result =
      normalizeV5ReviveSessionRow(
        session()
      );

    assert.equal(
      result.replay_version,
      5
    );

    assert.equal(
      Object.isFrozen(result),
      true
    );
  }
);

test(
  "V5 all five Continue counts accepted",
  () => {
    for (
      let count = 0;
      count <= 5;
      count += 1
    ) {
      assert.equal(
        normalizeV5ReviveSessionRow(
          session({
            continue_count: count,
          })
        ).continue_count,
        count
      );
    }
  }
);

test(
  "historical V4 session rejected by V5 contract",
  () => {
    assert.throws(
      () =>
        normalizeV5ReviveSessionRow(
          session({
            engine_version: 3,
            rules_version: 3,
            replay_version: 4,
          })
        ),
      /version/
    );
  }
);

test(
  "mixed V5 tuple rejected",
  () => {
    assert.throws(
      () =>
        normalizeV5ReviveSessionRow(
          session({
            rules_version: 3,
          })
        ),
      /version/
    );
  }
);

test(
  "sixth Continue count rejected",
  () => {
    assert.throws(
      () =>
        normalizeV5ReviveSessionRow(
          session({
            continue_count: 6,
          })
        ),
      /continue_count/
    );
  }
);

test(
  "historical retry can read submitted session",
  () => {
    assert.equal(
      normalizeV5ReviveSessionRow(
        session({
          status: "submitted",
          continue_count: 5,
        })
      ).status,
      "submitted"
    );
  }
);

test(
  "historical retry can read expired session",
  () => {
    assert.equal(
      normalizeV5ReviveSessionRow(
        session({
          status: "expired",
          continue_count: 5,
          expires_at:
            "2020-01-01T00:00:00.000Z",
        })
      ).status,
      "expired"
    );
  }
);

test(
  "unknown lifecycle rejected",
  () => {
    assert.throws(
      () =>
        normalizeV5ReviveSessionRow(
          session({
            status: "revived",
          })
        ),
      /status/
    );
  }
);

test(
  "credit progression matches SQL",
  () => {
    assert.deepEqual(
      [...V5_CREDIT_COSTS],
      [0, 1, 2, 4, 8, 16]
    );
  }
);

test(
  "all five financial receipt tiers accepted",
  () => {
    for (
      let i = 1;
      i <= 5;
      i += 1
    ) {
      const cost =
        V5_CREDIT_COSTS[i];

      const result =
        normalizeV5ReviveResult(
          receipt({
            continue_index: i,
            credit_cost: cost,
            balance_before: 31,
            balance_after:
              31 - cost,
            continue_count: i,
          })
        );

      assert.equal(
        result.credit_cost,
        cost
      );
    }
  }
);

test(
  "wrong credit cost rejected",
  () => {
    assert.throws(
      () =>
        normalizeV5ReviveResult(
          receipt({
            credit_cost: 5,
          })
        ),
      /credit cost/
    );
  }
);

test(
  "wrong balance subtraction rejected",
  () => {
    assert.throws(
      () =>
        normalizeV5ReviveResult(
          receipt({
            balance_after: 29,
          })
        ),
      /financial invariant/
    );
  }
);

test(
  "wrong Continue count rejected",
  () => {
    assert.throws(
      () =>
        normalizeV5ReviveResult(
          receipt({
            continue_count: 2,
          })
        ),
      /financial invariant/
    );
  }
);

test(
  "invalid fingerprint rejected",
  () => {
    assert.throws(
      () =>
        normalizeV5ReviveResult(
          receipt({
            verified_replay_fingerprint:
              "not-sha256",
          })
        ),
      /fingerprint/
    );
  }
);

test(
  "valid decimal bigint ledger ID retained as string",
  () => {
    const id =
      "9223372036854775807";

    assert.equal(
      normalizeV5ReviveResult(
        receipt({
          credit_transaction_id: id,
        })
      ).credit_transaction_id,
      id
    );
  }
);

test(
  "unsafe numeric ledger ID rejected",
  () => {
    assert.throws(
      () =>
        normalizeV5ReviveResult(
          receipt({
            credit_transaction_id:
              Number.MAX_SAFE_INTEGER + 1,
          })
        ),
      /độ chính xác/
    );
  }
);

test(
  "idempotency flag must be boolean",
  () => {
    assert.throws(
      () =>
        normalizeV5ReviveResult(
          receipt({
            idempotent: "true",
          })
        ),
      /idempotency/
    );
  }
);

test(
  "valid historical receipt accepted",
  () => {
    const result =
      normalizeV5ReviveResult(
        receipt({
          idempotent: true,
        })
      );

    assert.equal(
      result.idempotent,
      true
    );
  }
);

test(
  "legacy points response is not V5 receipt",
  () => {
    assert.throws(
      () =>
        normalizeV5ReviveResult({
          ...receipt(),
          credit_cost: undefined,
          points_cost: 5,
        }),
      /credit cost/
    );
  }
);
