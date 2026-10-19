"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const {
  assessFabiKdsControlProofV1
} = require(
  "../cingKdsFabiControlProofPolicyV1"
);

function evidence() {
  return {
    slo: {
      c04_p95_max_ms: 2_000,
      c03_p95_max_ms: 2_000,
      one_shot_max_ms: 119_000,
      c04_timeout_max_ppm: 10_000,
      c03_timeout_max_ppm: 10_000,
      recovery_max_ms: 20_000,
      eligible_transactions_per_minute_min: 1
    },

    observed: {
      c04: {
        request_count: 100,
        timeout_count: 0,
        p95_ms: 500
      },

      c03: {
        request_count: 10,
        timeout_count: 0,
        p95_ms: 700
      },

      one_shot: {
        count: 3,
        max_duration_ms: 110_000
      },

      recovery: {
        count: 1,
        max_duration_ms: 5_000
      },

      throughput: {
        eligible_transaction_count: 5,
        observed_duration_ms: 60_000
      }
    },

    integrity: {
      source_transaction_count: 5,
      durable_c04_transaction_count: 5,
      queue_transaction_count: 5,
      ready_transaction_count: 4,
      pending_c03_transaction_count: 1,
      review_required_transaction_count: 0,
      missing_transaction_count: 0,
      extra_transaction_count: 0,
      duplicate_transaction_count: 0,
      line_mismatch_count: 0,
      cup_mismatch_count: 0
    },

    overnight: {
      closed_event_count: 1,
      closed_raw_durable_count: 1,
      closed_c03_call_count: 0,
      closed_ready_count: 0,
      opening_retry_count: 1,
      opening_c03_call_count: 1,
      opening_reconciled_count: 1
    }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test(
  "approved aggregate evidence passes all control gates",
  () => {
    const result =
      assessFabiKdsControlProofV1(
        evidence()
      );

    assert.equal(result.decision, "pass");
    assert.equal(result.gates.realtime.pass, true);
    assert.equal(result.gates.completeness.pass, true);
    assert.equal(
      result.gates.line_and_cup_parity.pass,
      true
    );
    assert.equal(
      result.gates.overnight_policy.pass,
      true
    );
  }
);

test(
  "performance SLO breach yields HOLD without exposing request data",
  () => {
    const input = evidence();
    input.observed.c04.p95_ms = 2_001;

    const result =
      assessFabiKdsControlProofV1(input);

    assert.equal(result.decision, "hold");
    assert.deepEqual(
      result.gates.realtime.reasons,
      ["C04_P95_EXCEEDED"]
    );
    assert.deepEqual(
      Object.keys(result.observed).sort(),
      [
        "c03_timeout_ppm",
        "c04_timeout_ppm",
        "eligible_transactions_per_minute",
        "one_shot_hard_limit_ms"
      ]
    );
  }
);

test(
  "missing or extra transaction evidence yields HOLD",
  () => {
    const input = evidence();
    input.integrity.missing_transaction_count = 1;
    input.integrity.extra_transaction_count = 1;

    const result =
      assessFabiKdsControlProofV1(input);

    assert.equal(result.decision, "hold");
    assert.deepEqual(
      result.gates.completeness.reasons,
      ["TRANSACTION_MISSING", "TRANSACTION_EXTRA"]
    );
  }
);

test(
  "120-second one-shot boundary is a hard HOLD even with looser input",
  () => {
    const input = clone(evidence());
    input.slo.one_shot_max_ms = 119_999;
    input.observed.one_shot.max_duration_ms = 120_000;

    const result =
      assessFabiKdsControlProofV1(input);

    assert.equal(result.decision, "hold");
    assert.deepEqual(
      result.gates.realtime.reasons,
      ["ONE_SHOT_DURATION_EXCEEDED"]
    );
  }
);

test(
  "closed-hours C03 call or KDS ready yields HOLD",
  () => {
    const input = evidence();
    input.overnight.closed_c03_call_count = 1;
    input.overnight.closed_ready_count = 1;

    const result =
      assessFabiKdsControlProofV1(input);

    assert.equal(result.decision, "hold");
    assert.deepEqual(
      result.gates.overnight_policy.reasons,
      ["CLOSED_C03_CALLED", "CLOSED_KDS_READY"]
    );
  }
);

test(
  "policy source owns no environment, network, database, or timer primitive",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          "..",
          "cingKdsFabiControlProofPolicyV1.js"
        ),
        "utf8"
      );

    assert.doesNotMatch(
      source,
      /process\.env|fetch\(|axios|createClient|setInterval|setTimeout/
    );
  }
);
