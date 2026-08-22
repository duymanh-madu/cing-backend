const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  normalizeSubmissionRequest,
  normalizeSubmissionSessionRow,
  normalizeVerifiedReplayResult,
  normalizeSubmitRpcResult,
} = require(
  "../domain/cingBlockPuzzleSubmissionContracts"
);

const SESSION_ID =
  "11111111-2222-4333-8444-555555555555";

function validSession(
  overrides = {}
) {
  return {
    id:
      SESSION_ID,

    user_id:
      "0984966336",

    game_key:
      "cing-block-puzzle",

    seed:
      123456789,

    engine_version:
      1,

    rules_version:
      1,

    score_version:
      1,

    replay_version:
      1,

    play_cost:
      1,

    status:
      "active",

    created_at:
      "2026-08-22T08:00:00.000Z",

    expires_at:
      "2026-08-23T08:00:00.000Z",

    submitted_at:
      null,

    verified_score:
      null,

    replay_fingerprint:
      null,

    move_count:
      null,

    ...overrides,
  };
}

test(
  "submit request accepts only replay top-level field",
  () => {
    const replay = {
      moves: [],
    };

    const result =
      normalizeSubmissionRequest({
        sessionId:
          SESSION_ID,

        body: {
          replay,
        },
      });

    assert.equal(
      result.session_id,
      SESSION_ID
    );

    assert.equal(
      result.replay,
      replay
    );
  }
);

test(
  "submit request rejects client score",
  () => {
    assert.throws(
      () =>
        normalizeSubmissionRequest({
          sessionId:
            SESSION_ID,

          body: {
            replay: {},
            score: 999999,
          },
        }),
      {
        code:
          "BLOCK_PUZZLE_INVALID_SUBMIT_PAYLOAD",
      }
    );
  }
);

test(
  "submit request rejects client identity and game fields",
  () => {
    for (const field of [
      "user_id",
      "player_name",
      "avatar",
      "game_key",
    ]) {
      assert.throws(
        () =>
          normalizeSubmissionRequest({
            sessionId:
              SESSION_ID,

            body: {
              replay: {},
              [field]:
                "forged",
            },
          }),
        {
          code:
            "BLOCK_PUZZLE_INVALID_SUBMIT_PAYLOAD",
        }
      );
    }
  }
);

test(
  "submit request requires v4 session id",
  () => {
    assert.throws(
      () =>
        normalizeSubmissionRequest({
          sessionId:
            "bad-id",

          body: {
            replay: {},
          },
        }),
      {
        code:
          "BLOCK_PUZZLE_INVALID_SESSION_ID",
      }
    );
  }
);

test(
  "submission session accepts active authority row",
  () => {
    const session =
      normalizeSubmissionSessionRow(
        validSession()
      );

    assert.equal(
      session.status,
      "active"
    );
  }
);

test(
  "submission session accepts valid submitted row for idempotent retry",
  () => {
    const session =
      normalizeSubmissionSessionRow(
        validSession({
          status:
            "submitted",

          submitted_at:
            "2026-08-22T08:30:00.000Z",

          verified_score:
            120,

          replay_fingerprint:
            "a".repeat(64),

          move_count:
            17,
        })
      );

    assert.equal(
      session.status,
      "submitted"
    );
  }
);

test(
  "submission session rejects wrong game authority",
  () => {
    assert.throws(
      () =>
        normalizeSubmissionSessionRow(
          validSession({
            game_key:
              "black-pearl-rush",
          })
        )
    );
  }
);

test(
  "verified replay result is bounded to PostgreSQL integer contract",
  () => {
    const result =
      normalizeVerifiedReplayResult({
        score: 1000,
        move_count: 40,
        best_combo: 5,
        total_lines_cleared: 12,
        replay_fingerprint:
          "b".repeat(64),
      });

    assert.equal(
      result.verified_score,
      1000
    );

    assert.equal(
      result.move_count,
      40
    );
  }
);

test(
  "verified replay result rejects invalid fingerprint",
  () => {
    assert.throws(
      () =>
        normalizeVerifiedReplayResult({
          score: 1,
          move_count: 1,
          best_combo: 0,
          total_lines_cleared: 0,
          replay_fingerprint:
            "client-fingerprint",
        })
    );
  }
);

test(
  "submit RPC response preserves string-safe score identity",
  () => {
    const result =
      normalizeSubmitRpcResult({
        session_id:
          SESSION_ID,

        score_id:
          3887,

        verified_score:
          250,

        replay_fingerprint:
          "c".repeat(64),

        move_count:
          22,

        submitted_at:
          "2026-08-22T09:00:00.000Z",

        idempotent:
          false,
      });

    assert.equal(
      result.score_id,
      "3887"
    );

    assert.equal(
      result.idempotent,
      false
    );
  }
);
