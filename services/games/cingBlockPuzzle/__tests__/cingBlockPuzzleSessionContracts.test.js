const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  GAME_KEY,
  ENGINE_VERSION,
  RULES_VERSION,
  SCORE_VERSION,
  REPLAY_VERSION,
  SESSION_TTL_SECONDS,
  normalizeSessionRow,
} = require(
  "../domain/cingBlockPuzzleSessionContracts"
);

function validRow(
  overrides = {}
) {
  return {
    id:
      "11111111-1111-4111-8111-111111111111",

    request_id:
      "22222222-2222-4222-8222-222222222222",

    user_id:
      "84912345678",

    game_key:
      GAME_KEY,

    seed:
      20260822,

    engine_version:
      ENGINE_VERSION,

    rules_version:
      RULES_VERSION,

    score_version:
      SCORE_VERSION,

    replay_version:
      REPLAY_VERSION,

    play_cost:
      1,

    status:
      "active",

    created_at:
      "2026-08-22T08:00:00.000Z",

    expires_at:
      "2026-08-23T08:00:00.000Z",

    ...overrides,
  };
}

test(
  "session constants match deterministic engine v1 contract",
  () => {
    assert.equal(
      GAME_KEY,
      "cing-block-puzzle"
    );

    assert.equal(
      ENGINE_VERSION,
      1
    );

    assert.equal(
      RULES_VERSION,
      1
    );

    assert.equal(
      SCORE_VERSION,
      1
    );

    assert.equal(
      REPLAY_VERSION,
      1
    );

    assert.equal(
      SESSION_TTL_SECONDS,
      86400
    );
  }
);

test(
  "normalizes valid active paid session",
  () => {
    const session =
      normalizeSessionRow(
        validRow()
      );

    assert.equal(
      session.game_key,
      GAME_KEY
    );

    assert.equal(
      session.play_cost,
      1
    );

    assert.equal(
      session.status,
      "active"
    );

    assert.equal(
      session.seed,
      20260822
    );

    assert.equal(
      Object.isFrozen(
        session
      ),
      true
    );
  }
);

test(
  "rejects wrong game key",
  () => {
    assert.throws(
      () =>
        normalizeSessionRow(
          validRow({
            game_key:
              "black-pearl-rush",
          })
        ),
      /game_key không hợp lệ/
    );
  }
);

test(
  "rejects zero seed",
  () => {
    assert.throws(
      () =>
        normalizeSessionRow(
          validRow({
            seed: 0,
          })
        ),
      /seed không hợp lệ/
    );
  }
);

test(
  "rejects seed above uint32 range",
  () => {
    assert.throws(
      () =>
        normalizeSessionRow(
          validRow({
            seed:
              0x100000000,
          })
        ),
      /seed không hợp lệ/
    );
  }
);

test(
  "rejects unsupported engine version",
  () => {
    assert.throws(
      () =>
        normalizeSessionRow(
          validRow({
            engine_version:
              2,
          })
        ),
      /version không hợp lệ/
    );
  }
);

test(
  "rejects wrong play cost",
  () => {
    assert.throws(
      () =>
        normalizeSessionRow(
          validRow({
            play_cost: 0,
          })
        ),
      /play cost không hợp lệ/
    );
  }
);

test(
  "rejects non-active newly issued session",
  () => {
    assert.throws(
      () =>
        normalizeSessionRow(
          validRow({
            status:
              "submitted",
          })
        ),
      /session mới phải active/
    );
  }
);

test(
  "rejects missing identity",
  () => {
    assert.throws(
      () =>
        normalizeSessionRow(
          validRow({
            user_id: "",
          })
        ),
      /identity không hợp lệ/
    );
  }
);

test(
  "rejects missing lifecycle timestamps",
  () => {
    assert.throws(
      () =>
        normalizeSessionRow(
          validRow({
            expires_at:
              null,
          })
        ),
      /timestamp không hợp lệ/
    );
  }
);
