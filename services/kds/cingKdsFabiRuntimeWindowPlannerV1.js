"use strict";

/*
 * Pure scheduling planner.
 *
 * checkpoint_end_ms is NOT correctness/completeness authority.
 *
 * Every resumed poll deliberately overlaps the previous
 * successful checkpoint. Durable event fingerprinting owns
 * duplicate safety.
 *
 * Long outages recover in bounded forward chunks rather
 * than requesting an unbounded C04 window.
 */

function plannerError(
  code
) {
  const error =
    new Error(code);

  error.code =
    code;

  return error;
}

function nonnegativeInteger(
  value,
  code
) {
  const number =
    Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 0
  ) {
    throw plannerError(code);
  }

  return number;
}

function positiveInteger(
  value,
  code
) {
  const number =
    nonnegativeInteger(
      value,
      code
    );

  if (number < 1) {
    throw plannerError(code);
  }

  return number;
}

function normalizeCheckpoint(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return nonnegativeInteger(
    value,
    "KDS_WINDOW_CHECKPOINT_INVALID"
  );
}

function planFabiC04RecoveryWindowV1({
  now_ms,
  checkpoint_end_ms = null,

  overlap_ms,
  settle_lag_ms,
  max_advance_ms,
  bootstrap_lookback_ms
} = {}) {
  const nowMs =
    nonnegativeInteger(
      now_ms,
      "KDS_WINDOW_NOW_INVALID"
    );

  const checkpoint =
    normalizeCheckpoint(
      checkpoint_end_ms
    );

  const overlapMs =
    nonnegativeInteger(
      overlap_ms,
      "KDS_WINDOW_OVERLAP_INVALID"
    );

  const settleLagMs =
    nonnegativeInteger(
      settle_lag_ms,
      "KDS_WINDOW_SETTLE_LAG_INVALID"
    );

  const maxAdvanceMs =
    positiveInteger(
      max_advance_ms,
      "KDS_WINDOW_MAX_ADVANCE_INVALID"
    );

  const bootstrapLookbackMs =
    positiveInteger(
      bootstrap_lookback_ms,
      "KDS_WINDOW_BOOTSTRAP_INVALID"
    );

  if (
    settleLagMs >
      nowMs
  ) {
    throw plannerError(
      "KDS_WINDOW_SAFE_END_INVALID"
    );
  }

  const safeEndMs =
    nowMs -
    settleLagMs;

  /*
   * First activation.
   *
   * Bootstrap is bounded and does not claim any history
   * before this window is complete.
   */
  if (checkpoint === null) {
    const start =
      Math.max(
        0,
        safeEndMs -
          bootstrapLookbackMs
      );

    return Object.freeze({
      should_poll:
        safeEndMs >
        start,

      reason:
        safeEndMs > start
          ? "bootstrap"
          : "caught_up",

      start_date:
        start,

      end_date:
        safeEndMs,

      checkpoint_commit_ms:
        safeEndMs,

      checkpoint_basis_ms:
        null,

      replay_overlap_ms:
        0
    });
  }

  /*
   * Clock/source horizon is not ahead of the already
   * committed checkpoint. Do not regress checkpoint.
   */
  if (
    safeEndMs <=
      checkpoint
  ) {
    return Object.freeze({
      should_poll:
        false,

      reason:
        "caught_up",

      start_date:
        checkpoint,

      end_date:
        checkpoint,

      checkpoint_commit_ms:
        checkpoint,

      checkpoint_basis_ms:
        checkpoint,

      replay_overlap_ms:
        0
    });
  }

  /*
   * Bounded recovery.
   *
   * If backend was offline for hours/days, each successful
   * poll advances at most max_advance_ms.
   */
  const end =
    Math.min(
      safeEndMs,
      checkpoint +
        maxAdvanceMs
    );

  const start =
    Math.max(
      0,
      checkpoint -
        overlapMs
    );

  return Object.freeze({
    should_poll:
      true,

    reason:
      end <
      safeEndMs
        ? "recovery_chunk"
        : "live_overlap",

    start_date:
      start,

    end_date:
      end,

    checkpoint_commit_ms:
      end,

    checkpoint_basis_ms:
      checkpoint,

    replay_overlap_ms:
      checkpoint -
      start
  });
}

module.exports = {
  planFabiC04RecoveryWindowV1
};
