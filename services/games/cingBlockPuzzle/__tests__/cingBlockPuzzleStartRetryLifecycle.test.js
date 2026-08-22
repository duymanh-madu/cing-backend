const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  assertStartSessionLifecycle,
} = require(
  "../domain/cingBlockPuzzleSessionContracts"
);

function row(
  overrides = {}
) {
  return {
    status:
      "active",

    expires_at:
      "2099-01-01T00:00:00.000Z",

    ...overrides,
  };
}

test(
  "active unexpired start retry remains recoverable",
  () => {
    assert.doesNotThrow(
      () =>
        assertStartSessionLifecycle(
          row(),
          Date.parse(
            "2026-08-22T00:00:00.000Z"
          )
        )
    );
  }
);

test(
  "active row past expires_at is rejected as expired",
  () => {
    assert.throws(
      () =>
        assertStartSessionLifecycle(
          row({
            expires_at:
              "2026-08-22T00:00:00.000Z",
          }),
          Date.parse(
            "2026-08-23T00:00:00.000Z"
          )
        ),
      (error) =>
        error?.code ===
          "BLOCK_PUZZLE_SESSION_EXPIRED" &&
        error?.statusCode ===
          409
    );
  }
);

test(
  "explicit expired start retry is rejected",
  () => {
    assert.throws(
      () =>
        assertStartSessionLifecycle(
          row({
            status:
              "expired",
          })
        ),
      (error) =>
        error?.code ===
          "BLOCK_PUZZLE_SESSION_EXPIRED" &&
        error?.statusCode ===
          409
    );
  }
);

test(
  "submitted session cannot be recovered through start authority",
  () => {
    assert.throws(
      () =>
        assertStartSessionLifecycle(
          row({
            status:
              "submitted",
          })
        ),
      (error) =>
        error?.code ===
          "BLOCK_PUZZLE_SESSION_STATUS_INVALID" &&
        error?.statusCode ===
          409
    );
  }
);
