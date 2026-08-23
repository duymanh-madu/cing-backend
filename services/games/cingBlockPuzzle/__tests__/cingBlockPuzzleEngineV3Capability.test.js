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
  loadEngineV3,
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

test(
  "backend loads exact deterministic replay V3 contract",
  async () => {
    const engine =
      await loadEngineV3();

    assert.equal(
      engine.ENGINE_VERSION,
      2
    );

    assert.equal(
      engine.RULES_VERSION,
      2
    );

    assert.equal(
      engine.SCORE_VERSION,
      2
    );

    assert.equal(
      engine.REPLAY_VERSION,
      3
    );

    assert.equal(
      isSupportedEngineContract({
        engineVersion: 2,
        rulesVersion: 2,
        scoreVersion: 2,
        replayVersion: 3,
      }),
      true
    );

    const loaded =
      await loadEngineForVersion({
        engineVersion: 2,
        rulesVersion: 2,
        scoreVersion: 2,
        replayVersion: 3,
      });

    assert.equal(
      loaded.REPLAY_VERSION,
      3
    );
  }
);

test(
  "mixed replay V3 deterministic tuple fails closed",
  async () => {
    assert.equal(
      isSupportedEngineContract({
        engineVersion: 2,
        rulesVersion: 1,
        scoreVersion: 2,
        replayVersion: 3,
      }),
      false
    );

    await assert.rejects(
      () =>
        loadEngineForVersion({
          engineVersion: 2,
          rulesVersion: 1,
          scoreVersion: 2,
          replayVersion: 3,
        }),
      {
        code:
          "BLOCK_PUZZLE_UNSUPPORTED_ENGINE_CONTRACT",
      }
    );
  }
);

test(
  "V3 backend manifest matches checked-in deterministic bytes",
  () => {
    const root =
      path.join(
        __dirname,
        "../engine/v3"
      );

    const manifest =
      JSON.parse(
        fs.readFileSync(
          path.join(
            root,
            "source-manifest-v3.json"
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
      3
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
  "server replay authority accepts V3 event transcript",
  async () => {
    const engine =
      await loadEngineV3();

    const seed =
      0x12345678;

    let state =
      engine.createGameState({
        seed,
      });

    let replay =
      engine.createReplayTranscript(
        seed
      );

    for (
      let guard = 0;
      guard < 5000 &&
      !state.ended;
      guard += 1
    ) {
      let found = null;

      for (
        let trayIndex = 0;
        trayIndex <
          state.tray.length &&
        !found;
        trayIndex += 1
      ) {
        const piece =
          state.tray[
            trayIndex
          ];

        if (!piece) continue;

        for (
          let row = 0;
          row <
            engine.BOARD_SIZE &&
          !found;
          row += 1
        ) {
          for (
            let col = 0;
            col <
              engine.BOARD_SIZE;
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
              found = {
                trayIndex,
                row,
                col,
              };
              break;
            }
          }
        }
      }

      assert.ok(found);

      replay =
        engine.appendReplayMove(
          replay,
          engine.createReplayMove(
            state,
            found
          )
        );

      state =
        engine.applyMove(
          state,
          found
        ).state;
    }

    assert.equal(
      state.ended,
      true
    );

    const verified =
      await verifyReplayAuthority({
        transcript: replay,
        expectedSeed: seed,
        engineVersion: 2,
        rulesVersion: 2,
        scoreVersion: 2,
        replayVersion: 3,
        requireEnded: true,
      });

    assert.equal(
      verified.score,
      state.score
    );

    assert.equal(
      verified.move_count,
      state.moves
    );

    assert.equal(
      verified.continues_used,
      0
    );

    assert.match(
      verified.replay_fingerprint,
      /^[0-9a-f]{64}$/
    );
  }
);
