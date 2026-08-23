const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const path =
  require("path");

const {
  ENGINE_VERSION,
  RULES_VERSION,
  SCORE_VERSION,
  REPLAY_VERSION,
  normalizeSessionRow,
} = require(
  "../domain/cingBlockPuzzleSessionContracts"
);

const source =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "services/games/cingBlockPuzzle/cingBlockPuzzleSessionService.js"
    ),
    "utf8"
  );

test(
  "new Block Puzzle session issuer is exact deterministic replay V3",
  () => {
    assert.deepEqual(
      {
        engineVersion:
          ENGINE_VERSION,

        rulesVersion:
          RULES_VERSION,

        scoreVersion:
          SCORE_VERSION,

        replayVersion:
          REPLAY_VERSION,
      },
      {
        engineVersion: 2,
        rulesVersion: 2,
        scoreVersion: 2,
        replayVersion: 3,
      }
    );
  }
);

test(
  "session service passes issuer versions into atomic start authority",
  () => {
    assert.match(
      source,
      /engineVersion:\s*ENGINE_VERSION/
    );

    assert.match(
      source,
      /rulesVersion:\s*RULES_VERSION/
    );

    assert.match(
      source,
      /scoreVersion:\s*SCORE_VERSION/
    );

    assert.match(
      source,
      /replayVersion:\s*REPLAY_VERSION/
    );
  }
);

test(
  "legacy V1 session remains valid after replay V3 issuer activation",
  () => {
    const session =
      normalizeSessionRow({
        id:
          "11111111-1111-4111-8111-111111111111",

        request_id:
          "22222222-2222-4222-8222-222222222222",

        user_id:
          "0984966336",

        game_key:
          "cing-block-puzzle",

        seed:
          20260823,

        engine_version: 1,
        rules_version: 1,
        score_version: 1,
        replay_version: 1,

        play_cost: 1,

        status:
          "active",

        created_at:
          "2026-08-23T00:00:00.000Z",

        expires_at:
          "2026-08-24T00:00:00.000Z",
      });

    assert.equal(
      session.engine_version,
      1
    );

    assert.equal(
      session.rules_version,
      1
    );

    assert.equal(
      session.score_version,
      1
    );

    assert.equal(
      session.replay_version,
      1
    );
  }
);
