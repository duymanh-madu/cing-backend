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
} = require(
  "../engine/cingBlockPuzzleEngineLoader"
);

const {
  MAX_REPLAY_MOVES_V1,
  canonicalReplayJson,
  serverReplayFingerprint,
  verifyReplayAuthority,
} = require(
  "../domain/cingBlockPuzzleReplayAuthority"
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
      state.tray[trayIndex];

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

    const rawMove =
      findFirstLegalMove(
        engine,
        state
      );

    if (!rawMove) break;

    const replayMove =
      engine.createReplayMove(
        state,
        rawMove
      );

    transcript =
      engine.appendReplayMove(
        transcript,
        replayMove
      );

    state =
      engine.applyMove(
        state,
        rawMove
      ).state;
  }

  return {
    transcript,
    state,
  };
}

test(
  "backend loads deterministic ESM engine V1",
  async () => {
    const engine =
      await loadEngineV1();

    assert.equal(
      engine.GAME_KEY,
      "cing-block-puzzle"
    );

    assert.equal(
      engine.ENGINE_VERSION,
      1
    );

    assert.equal(
      engine.RULES_VERSION,
      1
    );

    assert.equal(
      engine.SCORE_VERSION,
      1
    );
  }
);

test(
  "backend engine source manifest matches checked-in V1 bytes",
  () => {
    const root =
      path.join(
        __dirname,
        "../engine/v1"
      );

    const manifest =
      JSON.parse(
        fs.readFileSync(
          path.join(
            root,
            "source-manifest-v1.json"
          ),
          "utf8"
        )
      );

    for (
      const [file, expected]
      of Object.entries(
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
  "server canonical replay fingerprint is stable SHA-256",
  async () => {
    const engine =
      await loadEngineV1();

    const {
      transcript,
    } =
      buildTranscript(
        engine,
        20260822,
        12
      );

    const a =
      serverReplayFingerprint(
        transcript
      );

    const b =
      serverReplayFingerprint(
        structuredClone(
          transcript
        )
      );

    assert.equal(a, b);

    assert.match(
      a,
      /^[0-9a-f]{64}$/
    );

    assert.equal(
      a,
      crypto
        .createHash("sha256")
        .update(
          canonicalReplayJson(
            transcript
          ),
          "utf8"
        )
        .digest("hex")
    );
  }
);

test(
  "authority derives score and never accepts submitted score",
  async () => {
    const engine =
      await loadEngineV1();

    const {
      transcript,
      state,
    } =
      buildTranscript(
        engine,
        13579,
        10
      );

    const result =
      await verifyReplayAuthority({
        transcript,
        expectedSeed:
          13579,

        engineVersion:
          1,

        rulesVersion:
          1,

        scoreVersion:
          1,

        replayVersion:
          1,

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
  }
);

test(
  "authority rejects session seed mismatch",
  async () => {
    const engine =
      await loadEngineV1();

    const {
      transcript,
    } =
      buildTranscript(
        engine,
        777,
        3
      );

    await assert.rejects(
      () =>
        verifyReplayAuthority({
          transcript,
          expectedSeed:
            778,

          engineVersion:
            1,

          rulesVersion:
            1,

          scoreVersion:
            1,

          replayVersion:
            1,

          requireEnded:
            false,
        }),

      (error) =>
        error.code ===
        "BLOCK_PUZZLE_REPLAY_SESSION_MISMATCH"
    );
  }
);

test(
  "authority rejects tampered piece identity",
  async () => {
    const engine =
      await loadEngineV1();

    const {
      transcript,
    } =
      buildTranscript(
        engine,
        998877,
        3
      );

    const tampered =
      structuredClone(
        transcript
      );

    tampered.moves[0]
      .pieceInstanceId =
      "p999999";

    await assert.rejects(
      () =>
        verifyReplayAuthority({
          transcript:
            tampered,

          expectedSeed:
            998877,

          engineVersion:
            1,

          rulesVersion:
            1,

          scoreVersion:
            1,

          replayVersion:
            1,

          requireEnded:
            false,
        }),
      (error) => {
        assert.equal(
          error?.code,
          "BLOCK_PUZZLE_INVALID_REPLAY"
        );

        assert.match(
          String(
            error?.cause?.message || ""
          ),
          /piece instance mismatch/
        );

        return true;
      }
    );
  }
);

test(
  "authority fails closed on unfinished gameplay when submission requires game over",
  async () => {
    const engine =
      await loadEngineV1();

    const {
      transcript,
      state,
    } =
      buildTranscript(
        engine,
        42,
        1
      );

    assert.equal(
      state.ended,
      false
    );

    await assert.rejects(
      () =>
        verifyReplayAuthority({
          transcript,

          expectedSeed:
            42,

          engineVersion:
            1,

          rulesVersion:
            1,

          scoreVersion:
            1,

          replayVersion:
            1,
        }),

      (error) =>
        error.code ===
        "BLOCK_PUZZLE_REPLAY_NOT_FINISHED"
    );
  }
);

test(
  "replay V1 has explicit anti-resource-exhaustion move bound",
  () => {
    assert.equal(
      Number.isSafeInteger(
        MAX_REPLAY_MOVES_V1
      ),
      true
    );

    assert.ok(
      MAX_REPLAY_MOVES_V1 > 0
    );
  }
);
