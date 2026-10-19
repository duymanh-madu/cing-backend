"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  planFabiC04RecoveryWindowV1
} = require(
  "../cingKdsFabiRuntimeWindowPlannerV1"
);

const POLICY = {
  overlap_ms:
    60_000,

  settle_lag_ms:
    5_000,

  max_advance_ms:
    15 * 60_000,

  bootstrap_lookback_ms:
    15 * 60_000
};

test(
  "bootstrap uses bounded lookback behind safe end",
  () => {
    const result =
      planFabiC04RecoveryWindowV1({
        now_ms:
          2_000_000,

        checkpoint_end_ms:
          null,

        ...POLICY
      });

    assert.equal(
      result.reason,
      "bootstrap"
    );

    assert.equal(
      result.end_date,
      1_995_000
    );

    assert.equal(
      result.start_date,
      1_095_000
    );

    assert.equal(
      result.checkpoint_commit_ms,
      result.end_date
    );
  }
);

test(
  "normal resumed poll replays exact overlap",
  () => {
    const result =
      planFabiC04RecoveryWindowV1({
        now_ms:
          2_000_000,

        checkpoint_end_ms:
          1_900_000,

        ...POLICY
      });

    assert.equal(
      result.reason,
      "live_overlap"
    );

    assert.equal(
      result.start_date,
      1_840_000
    );

    assert.equal(
      result.end_date,
      1_995_000
    );

    assert.equal(
      result.replay_overlap_ms,
      60_000
    );
  }
);

test(
  "long outage advances in bounded recovery chunk",
  () => {
    const result =
      planFabiC04RecoveryWindowV1({
        now_ms:
          10_000_000,

        checkpoint_end_ms:
          1_000_000,

        ...POLICY
      });

    assert.equal(
      result.reason,
      "recovery_chunk"
    );

    assert.equal(
      result.start_date,
      940_000
    );

    assert.equal(
      result.end_date,
      1_900_000
    );
  }
);

test(
  "caught-up checkpoint never regresses",
  () => {
    const result =
      planFabiC04RecoveryWindowV1({
        now_ms:
          2_000_000,

        checkpoint_end_ms:
          2_000_000,

        ...POLICY
      });

    assert.equal(
      result.should_poll,
      false
    );

    assert.equal(
      result.reason,
      "caught_up"
    );

    assert.equal(
      result.checkpoint_commit_ms,
      2_000_000
    );
  }
);

test(
  "future checkpoint from clock movement does not regress",
  () => {
    const result =
      planFabiC04RecoveryWindowV1({
        now_ms:
          2_000_000,

        checkpoint_end_ms:
          2_100_000,

        ...POLICY
      });

    assert.equal(
      result.should_poll,
      false
    );

    assert.equal(
      result.end_date,
      2_100_000
    );
  }
);

test(
  "overlap never underflows epoch zero",
  () => {
    const result =
      planFabiC04RecoveryWindowV1({
        now_ms:
          100_000,

        checkpoint_end_ms:
          20_000,

        overlap_ms:
          60_000,

        settle_lag_ms:
          0,

        max_advance_ms:
          100_000,

        bootstrap_lookback_ms:
          10_000
      });

    assert.equal(
      result.start_date,
      0
    );

    assert.equal(
      result.replay_overlap_ms,
      20_000
    );
  }
);

test(
  "checkpoint is scheduling metadata not a no-overlap filter",
  () => {
    const result =
      planFabiC04RecoveryWindowV1({
        now_ms:
          5_000_000,

        checkpoint_end_ms:
          4_000_000,

        ...POLICY
      });

    assert.ok(
      result.start_date <
      result.checkpoint_basis_ms
    );
  }
);

test(
  "invalid timing policy fails closed",
  () => {
    assert.throws(
      () =>
        planFabiC04RecoveryWindowV1({
          now_ms:
            1_000,

          checkpoint_end_ms:
            null,

          overlap_ms:
            -1,

          settle_lag_ms:
            0,

          max_advance_ms:
            1,

          bootstrap_lookback_ms:
            1
        }),
      /KDS_WINDOW_OVERLAP_INVALID/
    );
  }
);
