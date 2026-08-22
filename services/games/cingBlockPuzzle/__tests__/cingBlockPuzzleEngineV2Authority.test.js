const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const crypto =
  require("crypto");

const fs =
  require("fs");

const path =
  require("path");

const {
  loadEngineV1,
  loadEngineV2,
  loadEngineForVersion,
  isSupportedEngineContract,
} = require(
  "../engine/cingBlockPuzzleEngineLoader"
);

const {
  verifyReplayAuthority,
} = require(
  "../domain/cingBlockPuzzleReplayAuthority"
);

const {
  normalizeSessionRow,
} = require(
  "../domain/cingBlockPuzzleSessionContracts"
);

const {
  normalizeSubmissionSessionRow,
} = require(
  "../domain/cingBlockPuzzleSubmissionContracts"
);

function findFirstLegalMove(
  engine,
  state
) {
  for (
    let trayIndex = 0;
    trayIndex <
      state.tray.length;
    trayIndex += 1
  ) {
    const piece =
      state.tray[
        trayIndex
      ];

    if (!piece) continue;

    for (
      let row = 0;
      row < engine.BOARD_SIZE;
      row += 1
    ) {
      for (
        let col = 0;
        col < engine.BOARD_SIZE;
        col += 1
      ) {
        if (
          engine.canPlacePiece(
            state.board,
            piece,
            row,
            col
          )
        ) {
          return {
            trayIndex,
            row,
            col,
          };
        }
      }
    }
  }

  return null;
}

function buildTranscript(
  engine,
  seed,
  maximumMoves
) {
  let state =
    engine.createGameState({
      seed,
    });

  let transcript =
    engine.createReplayTranscript(
      seed
    );

  for (
    let index = 0;
    index < maximumMoves;
    index += 1
  ) {
    if (state.ended) break;

    const move =
      findFirstLegalMove(
        engine,
        state
      );

    if (!move) break;

    const replayMove =
      engine.createReplayMove(
        state,
        move
      );

    transcript =
      engine.appendReplayMove(
        transcript,
        replayMove
      );

    state =
      engine.applyMove(
        state,
        move
      ).state;
  }

  return {
    transcript,
    state,
  };
}

function v2SessionRow(
  overrides = {}
) {
  return {
    id:
      "11111111-1111-4111-8111-111111111111",

    request_id:
      "22222222-2222-4222-8222-222222222222",

    user_id:
      "0984966336",

    game_key:
      "cing-block-puzzle",

    seed:
      20260822,

    engine_version: 2,
    rules_version: 2,
    score_version: 2,
    replay_version: 2,

    play_cost: 1,

    status:
      "active",

    created_at:
      "2026-08-22T08:00:00.000Z",

    expires_at:
      "2099-08-23T08:00:00.000Z",

    ...overrides,
  };
}

test(
  "backend loads V1 and V2 deterministic engines side by side",
  async () => {
    const v1 =
      await loadEngineV1();

    const v2 =
      await loadEngineV2();

    assert.equal(
      v1.ENGINE_VERSION,
      1
    );

    assert.equal(
      v2.ENGINE_VERSION,
      2
    );

    assert.equal(
      v2.RULES_VERSION,
      2
    );

    assert.equal(
      v2.SCORE_VERSION,
      2
    );
  }
);

test(
  "V2 backend manifest matches checked-in deterministic bytes",
  () => {
    const root =
      path.join(
        __dirname,
        "../engine/v2"
      );

    const manifest =
      JSON.parse(
        fs.readFileSync(
          path.join(
            root,
            "source-manifest-v2.json"
          ),
          "utf8"
        )
      );

    assert.equal(
      manifest.engine_version,
      2
    );

    assert.equal(
      manifest.rules_version,
      2
    );

    assert.equal(
      manifest.score_version,
      2
    );

    assert.equal(
      manifest.replay_version,
      2
    );

    for (
      const [
        file,
        expected,
      ] of Object.entries(
        manifest.files
      )
    ) {
      const actual =
        crypto
          .createHash("sha256")
          .update(
            fs.readFileSync(
              path.join(
                root,
                file
              )
            )
          )
          .digest("hex");

      assert.equal(
        actual,
        expected,
        file
      );
    }
  }
);

test(
  "engine loader accepts only exact V1 or V2 tuples",
  async () => {
    assert.equal(
      isSupportedEngineContract({
        engineVersion: 1,
        rulesVersion: 1,
        scoreVersion: 1,
        replayVersion: 1,
      }),
      true
    );

    assert.equal(
      isSupportedEngineContract({
        engineVersion: 2,
        rulesVersion: 2,
        scoreVersion: 2,
        replayVersion: 2,
      }),
      true
    );

    assert.equal(
      isSupportedEngineContract({
        engineVersion: 2,
        rulesVersion: 1,
        scoreVersion: 2,
        replayVersion: 2,
      }),
      false
    );

    await assert.rejects(
      () =>
        loadEngineForVersion({
          engineVersion: 2,
          rulesVersion: 1,
          scoreVersion: 2,
          replayVersion: 2,
        }),
      {
        code:
          "BLOCK_PUZZLE_UNSUPPORTED_ENGINE_CONTRACT",
      }
    );
  }
);

test(
  "session normalization accepts exact V2 authority row",
  () => {
    const session =
      normalizeSessionRow(
        v2SessionRow()
      );

    assert.equal(
      session.engine_version,
      2
    );

    assert.equal(
      session.rules_version,
      2
    );
  }
);

test(
  "submission normalization accepts exact V2 authority row",
  () => {
    const row =
      v2SessionRow();

    delete row.request_id;

    const session =
      normalizeSubmissionSessionRow(
        {
          ...row,

          submitted_at:
            null,

          verified_score:
            null,

          replay_fingerprint:
            null,

          move_count:
            null,
        }
      );

    assert.equal(
      session.engine_version,
      2
    );

    assert.equal(
      session.replay_version,
      2
    );
  }
);

test(
  "mixed session version tuple fails closed",
  () => {
    assert.throws(
      () =>
        normalizeSessionRow(
          v2SessionRow({
            rules_version: 1,
          })
        ),
      /version không hợp lệ/
    );
  }
);

test(
  "server replay authority derives V2 score from V2 engine",
  async () => {
    const engine =
      await loadEngineV2();

    const {
      transcript,
      state,
    } =
      buildTranscript(
        engine,
        13579,
        20
      );

    const result =
      await verifyReplayAuthority({
        transcript,

        expectedSeed:
          13579,

        engineVersion: 2,
        rulesVersion: 2,
        scoreVersion: 2,
        replayVersion: 2,

        requireEnded:
          false,
      });

    assert.equal(
      result.score,
      state.score
    );

    assert.equal(
      result.move_count,
      state.moves
    );

    assert.equal(
      result.best_combo,
      state.bestCombo
    );

    assert.equal(
      result.total_lines_cleared,
      state.totalLinesCleared
    );

    assert.match(
      result.replay_fingerprint,
      /^[0-9a-f]{64}$/
    );
  }
);
