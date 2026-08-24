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
  loadEngineV4,
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
  "backend loads exact deterministic V4 contract",
  async () => {
    const engine =
      await loadEngineV4();

    assert.equal(
      engine.ENGINE_VERSION,
      3
    );

    assert.equal(
      engine.RULES_VERSION,
      3
    );

    assert.equal(
      engine.SCORE_VERSION,
      3
    );

    assert.equal(
      engine.REPLAY_VERSION,
      4
    );

    assert.equal(
      engine.PIECE_CATALOG.length,
      37
    );

    assert.equal(
      engine.perfectClearBonus(1),
      400
    );

    assert.equal(
      isSupportedEngineContract({
        engineVersion: 3,
        rulesVersion: 3,
        scoreVersion: 3,
        replayVersion: 4,
      }),
      true
    );

    const loaded =
      await loadEngineForVersion({
        engineVersion: 3,
        rulesVersion: 3,
        scoreVersion: 3,
        replayVersion: 4,
      });

    assert.equal(
      loaded.REPLAY_VERSION,
      4
    );
  }
);

test(
  "mixed V4 deterministic tuple fails closed",
  async () => {
    assert.equal(
      isSupportedEngineContract({
        engineVersion: 3,
        rulesVersion: 2,
        scoreVersion: 3,
        replayVersion: 4,
      }),
      false
    );

    await assert.rejects(
      () =>
        loadEngineForVersion({
          engineVersion: 3,
          rulesVersion: 2,
          scoreVersion: 3,
          replayVersion: 4,
        }),
      {
        code:
          "BLOCK_PUZZLE_UNSUPPORTED_ENGINE_CONTRACT",
      }
    );
  }
);

test(
  "V4 backend manifest matches checked-in deterministic bytes",
  () => {
    const root =
      path.join(
        __dirname,
        "../engine/v4"
      );

    const manifest =
      JSON.parse(
        fs.readFileSync(
          path.join(
            root,
            "source-manifest-v4.json"
          ),
          "utf8"
        )
      );

    assert.equal(
      manifest.engine_version,
      3
    );

    assert.equal(
      manifest.rules_version,
      3
    );

    assert.equal(
      manifest.score_version,
      3
    );

    assert.equal(
      manifest.replay_version,
      4
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
  "server replay authority accepts V4 event transcript",
  async () => {
    const engine =
      await loadEngineV4();

    const seed =
      0x13572468;

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

        if (!piece) {
          continue;
        }

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
        engineVersion: 3,
        rulesVersion: 3,
        scoreVersion: 3,
        replayVersion: 4,
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

test(
  "V4 continue deterministically restores playability",
  async () => {
    const engine =
      await loadEngineV4();

    const base =
      engine.createGameState({
        seed: 987654321,
      });

    const terminal =
      Object.freeze({
        ...base,

        tray:
          Object.freeze([
            null,
            null,
            null,
          ]),

        ended: true,
      });

    const continued =
      engine.applyContinue(
        terminal
      );

    assert.equal(
      continued.state.ended,
      false
    );

    assert.equal(
      continued.state.continuesUsed,
      1
    );

    assert.equal(
      continued.event.type,
      "continued"
    );

    assert.equal(
      engine.isGameOver(
        continued.state.board,
        continued.state.tray
      ),
      false
    );

    assert.equal(
      continued.state.score,
      terminal.score
    );
  }
);
