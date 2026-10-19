"use strict";

/*
 * Cing KDS FABi Control-Proof Policy V1
 *
 * Pure, redacted-evidence assessor for the 65E Production control proof.
 * It performs no clock, network, database, environment, timer, or runtime
 * work. The caller supplies only aggregate counts and durations, never tokens,
 * invoice numbers, customer information, or item names.
 */

const RATE_SCALE =
  1_000_000;

const HARD_MAX_ONE_SHOT_MS =
  120_000;

function policyError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function requiredObject(value, code) {
  if (!isObject(value)) {
    throw policyError(code);
  }

  return value;
}

function count(value, code) {
  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > 1_000_000_000
  ) {
    throw policyError(code);
  }

  return parsed;
}

function positive(value, code) {
  const parsed = count(value, code);

  if (parsed < 1) {
    throw policyError(code);
  }

  return parsed;
}

function ratePpm(timeouts, requests) {
  return Math.floor(
    (timeouts * RATE_SCALE) / requests
  );
}

function validateSlo(input) {
  const slo = requiredObject(
    input,
    "KDS_CONTROL_PROOF_SLO_REQUIRED"
  );

  const oneShotMax = positive(
    slo.one_shot_max_ms,
    "KDS_CONTROL_PROOF_SLO_ONE_SHOT_INVALID"
  );
  const c04TimeoutMax = count(
    slo.c04_timeout_max_ppm,
    "KDS_CONTROL_PROOF_SLO_C04_TIMEOUT_INVALID"
  );
  const c03TimeoutMax = count(
    slo.c03_timeout_max_ppm,
    "KDS_CONTROL_PROOF_SLO_C03_TIMEOUT_INVALID"
  );

  if (oneShotMax >= HARD_MAX_ONE_SHOT_MS) {
    throw policyError(
      "KDS_CONTROL_PROOF_SLO_ONE_SHOT_INVALID"
    );
  }

  if (
    c04TimeoutMax > RATE_SCALE ||
    c03TimeoutMax > RATE_SCALE
  ) {
    throw policyError(
      "KDS_CONTROL_PROOF_SLO_TIMEOUT_RATE_INVALID"
    );
  }

  return Object.freeze({
    c04_p95_max_ms:
      positive(
        slo.c04_p95_max_ms,
        "KDS_CONTROL_PROOF_SLO_C04_P95_INVALID"
      ),

    c03_p95_max_ms:
      positive(
        slo.c03_p95_max_ms,
        "KDS_CONTROL_PROOF_SLO_C03_P95_INVALID"
      ),

    one_shot_max_ms:
      oneShotMax,

    c04_timeout_max_ppm:
      c04TimeoutMax,

    c03_timeout_max_ppm:
      c03TimeoutMax,

    recovery_max_ms:
      positive(
        slo.recovery_max_ms,
        "KDS_CONTROL_PROOF_SLO_RECOVERY_INVALID"
      ),

    eligible_transactions_per_minute_min:
      count(
        slo.eligible_transactions_per_minute_min,
        "KDS_CONTROL_PROOF_SLO_THROUGHPUT_INVALID"
      )
  });
}

function validateTransport(input, code) {
  const transport = requiredObject(input, code);
  const requestCount = positive(
    transport.request_count,
    `${code}_REQUEST_COUNT_INVALID`
  );
  const timeoutCount = count(
    transport.timeout_count,
    `${code}_TIMEOUT_COUNT_INVALID`
  );

  if (timeoutCount > requestCount) {
    throw policyError(
      `${code}_TIMEOUT_COUNT_INVALID`
    );
  }

  return Object.freeze({
    request_count: requestCount,
    timeout_count: timeoutCount,
    p95_ms: count(
      transport.p95_ms,
      `${code}_P95_INVALID`
    )
  });
}

function validateObserved(input) {
  const observed = requiredObject(
    input,
    "KDS_CONTROL_PROOF_OBSERVED_REQUIRED"
  );
  const oneShot = requiredObject(
    observed.one_shot,
    "KDS_CONTROL_PROOF_ONE_SHOT_REQUIRED"
  );
  const recovery = requiredObject(
    observed.recovery,
    "KDS_CONTROL_PROOF_RECOVERY_REQUIRED"
  );
  const throughput = requiredObject(
    observed.throughput,
    "KDS_CONTROL_PROOF_THROUGHPUT_REQUIRED"
  );

  return Object.freeze({
    c04: validateTransport(
      observed.c04,
      "KDS_CONTROL_PROOF_C04"
    ),

    c03: validateTransport(
      observed.c03,
      "KDS_CONTROL_PROOF_C03"
    ),

    one_shot: Object.freeze({
      count: positive(
        oneShot.count,
        "KDS_CONTROL_PROOF_ONE_SHOT_COUNT_INVALID"
      ),
      max_duration_ms: count(
        oneShot.max_duration_ms,
        "KDS_CONTROL_PROOF_ONE_SHOT_DURATION_INVALID"
      )
    }),

    recovery: Object.freeze({
      count: positive(
        recovery.count,
        "KDS_CONTROL_PROOF_RECOVERY_COUNT_INVALID"
      ),
      max_duration_ms: count(
        recovery.max_duration_ms,
        "KDS_CONTROL_PROOF_RECOVERY_DURATION_INVALID"
      )
    }),

    throughput: Object.freeze({
      eligible_transaction_count: count(
        throughput.eligible_transaction_count,
        "KDS_CONTROL_PROOF_ELIGIBLE_COUNT_INVALID"
      ),
      observed_duration_ms: positive(
        throughput.observed_duration_ms,
        "KDS_CONTROL_PROOF_THROUGHPUT_DURATION_INVALID"
      )
    })
  });
}

function validateIntegrity(input) {
  const integrity = requiredObject(
    input,
    "KDS_CONTROL_PROOF_INTEGRITY_REQUIRED"
  );
  const keys = [
    "source_transaction_count",
    "durable_c04_transaction_count",
    "queue_transaction_count",
    "ready_transaction_count",
    "pending_c03_transaction_count",
    "review_required_transaction_count",
    "missing_transaction_count",
    "extra_transaction_count",
    "duplicate_transaction_count",
    "line_mismatch_count",
    "cup_mismatch_count"
  ];
  const output = {};

  for (const key of keys) {
    output[key] = count(
      integrity[key],
      "KDS_CONTROL_PROOF_INTEGRITY_INVALID"
    );
  }

  if (output.source_transaction_count < 1) {
    throw policyError(
      "KDS_CONTROL_PROOF_SOURCE_SAMPLE_EMPTY"
    );
  }

  return Object.freeze(output);
}

function validateOvernight(input) {
  const overnight = requiredObject(
    input,
    "KDS_CONTROL_PROOF_OVERNIGHT_REQUIRED"
  );

  return Object.freeze({
    closed_event_count: positive(
      overnight.closed_event_count,
      "KDS_CONTROL_PROOF_OVERNIGHT_EVENT_INVALID"
    ),
    closed_raw_durable_count: count(
      overnight.closed_raw_durable_count,
      "KDS_CONTROL_PROOF_OVERNIGHT_DURABLE_INVALID"
    ),
    closed_c03_call_count: count(
      overnight.closed_c03_call_count,
      "KDS_CONTROL_PROOF_OVERNIGHT_C03_INVALID"
    ),
    closed_ready_count: count(
      overnight.closed_ready_count,
      "KDS_CONTROL_PROOF_OVERNIGHT_READY_INVALID"
    ),
    opening_retry_count: positive(
      overnight.opening_retry_count,
      "KDS_CONTROL_PROOF_OPENING_RETRY_INVALID"
    ),
    opening_c03_call_count: positive(
      overnight.opening_c03_call_count,
      "KDS_CONTROL_PROOF_OPENING_C03_INVALID"
    ),
    opening_reconciled_count: count(
      overnight.opening_reconciled_count,
      "KDS_CONTROL_PROOF_OPENING_RECONCILED_INVALID"
    )
  });
}

function gate(pass, reasons) {
  return Object.freeze({
    pass,
    reasons: Object.freeze(reasons.slice())
  });
}

function assessFabiKdsControlProofV1({
  slo,
  observed,
  integrity,
  overnight
} = {}) {
  const approvedSlo = validateSlo(slo);
  const measured = validateObserved(observed);
  const exactness = validateIntegrity(integrity);
  const closedHours = validateOvernight(overnight);

  const realtimeReasons = [];
  const c04TimeoutPpm = ratePpm(
    measured.c04.timeout_count,
    measured.c04.request_count
  );
  const c03TimeoutPpm = ratePpm(
    measured.c03.timeout_count,
    measured.c03.request_count
  );
  const throughputPerMinute = Math.floor(
    (measured.throughput.eligible_transaction_count *
      60_000) /
    measured.throughput.observed_duration_ms
  );

  if (measured.c04.p95_ms > approvedSlo.c04_p95_max_ms) {
    realtimeReasons.push("C04_P95_EXCEEDED");
  }

  if (measured.c03.p95_ms > approvedSlo.c03_p95_max_ms) {
    realtimeReasons.push("C03_P95_EXCEEDED");
  }

  if (c04TimeoutPpm > approvedSlo.c04_timeout_max_ppm) {
    realtimeReasons.push("C04_TIMEOUT_RATE_EXCEEDED");
  }

  if (c03TimeoutPpm > approvedSlo.c03_timeout_max_ppm) {
    realtimeReasons.push("C03_TIMEOUT_RATE_EXCEEDED");
  }

  if (
    measured.one_shot.max_duration_ms >=
      HARD_MAX_ONE_SHOT_MS ||
    measured.one_shot.max_duration_ms >
      approvedSlo.one_shot_max_ms
  ) {
    realtimeReasons.push("ONE_SHOT_DURATION_EXCEEDED");
  }

  if (
    measured.recovery.max_duration_ms >
    approvedSlo.recovery_max_ms
  ) {
    realtimeReasons.push("RECOVERY_DURATION_EXCEEDED");
  }

  if (
    throughputPerMinute <
    approvedSlo.eligible_transactions_per_minute_min
  ) {
    realtimeReasons.push("THROUGHPUT_BELOW_MINIMUM");
  }

  const completenessReasons = [];

  for (
    const [key, code] of [
      ["missing_transaction_count", "TRANSACTION_MISSING"],
      ["extra_transaction_count", "TRANSACTION_EXTRA"],
      ["duplicate_transaction_count", "TRANSACTION_DUPLICATE"]
    ]
  ) {
    if (exactness[key] !== 0) {
      completenessReasons.push(code);
    }
  }

  if (
    exactness.source_transaction_count !==
      exactness.durable_c04_transaction_count ||
    exactness.source_transaction_count !==
      exactness.queue_transaction_count
  ) {
    completenessReasons.push("CARDINALITY_MISMATCH");
  }

  if (
    exactness.ready_transaction_count +
      exactness.pending_c03_transaction_count +
      exactness.review_required_transaction_count !==
    exactness.queue_transaction_count
  ) {
    completenessReasons.push("QUEUE_STATE_CARDINALITY_MISMATCH");
  }

  const parityReasons = [];

  if (exactness.line_mismatch_count !== 0) {
    parityReasons.push("LINE_PARITY_MISMATCH");
  }

  if (exactness.cup_mismatch_count !== 0) {
    parityReasons.push("CUP_PARITY_MISMATCH");
  }

  const overnightReasons = [];

  if (
    closedHours.closed_raw_durable_count !==
    closedHours.closed_event_count
  ) {
    overnightReasons.push("CLOSED_RAW_DURABILITY_MISMATCH");
  }

  if (closedHours.closed_c03_call_count !== 0) {
    overnightReasons.push("CLOSED_C03_CALLED");
  }

  if (closedHours.closed_ready_count !== 0) {
    overnightReasons.push("CLOSED_KDS_READY");
  }

  if (
    closedHours.opening_reconciled_count >
    closedHours.opening_retry_count
  ) {
    overnightReasons.push("OPENING_RECONCILIATION_INVALID");
  }

  const realtime = gate(
    realtimeReasons.length === 0,
    realtimeReasons
  );
  const completeness = gate(
    completenessReasons.length === 0,
    completenessReasons
  );
  const lineAndCupParity = gate(
    parityReasons.length === 0,
    parityReasons
  );
  const overnightPolicy = gate(
    overnightReasons.length === 0,
    overnightReasons
  );

  return Object.freeze({
    decision:
      realtime.pass &&
      completeness.pass &&
      lineAndCupParity.pass &&
      overnightPolicy.pass
        ? "pass"
        : "hold",

    gates: Object.freeze({
      realtime,
      completeness,
      line_and_cup_parity: lineAndCupParity,
      overnight_policy: overnightPolicy
    }),

    observed: Object.freeze({
      c04_timeout_ppm: c04TimeoutPpm,
      c03_timeout_ppm: c03TimeoutPpm,
      eligible_transactions_per_minute:
        throughputPerMinute,
      one_shot_hard_limit_ms:
        HARD_MAX_ONE_SHOT_MS
    })
  });
}

module.exports = {
  HARD_MAX_ONE_SHOT_MS,
  RATE_SCALE,
  assessFabiKdsControlProofV1
};
