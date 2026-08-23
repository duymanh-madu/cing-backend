const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const { pathToFileURL } =
  require("node:url");

let enginePromise = null;

function loadEngine() {
  if (!enginePromise) {
    const file =
      path.join(
        process.cwd(),
        "services/games/cingBlockPuzzle/engine/v3/index.js"
      );

    enginePromise =
      import(
        pathToFileURL(file).href
      );
  }

  return enginePromise;
}

function findLegalMove(
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
      row <
        engine.BOARD_SIZE;
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

function playUntilEnded(
  engine,
  state,
  replay
) {
  let currentState =
    state;

  let currentReplay =
    replay;

  for (
    let i = 0;
    i < 5000;
    i += 1
  ) {
    if (
      currentState.ended
    ) {
      return {
        state:
          currentState,

        replay:
          currentReplay,
      };
    }

    const move =
      findLegalMove(
        engine,
        currentState
      );

    assert.ok(move);

    const replayMove =
      engine.createReplayMove(
        currentState,
        move
      );

    currentReplay =
      engine.appendReplayMove(
        currentReplay,
        replayMove
      );

    currentState =
      engine.applyMove(
        currentState,
        move
      ).state;
  }

  throw new Error(
    "terminal state not reached"
  );
}

test(
  "backend V3 deterministic continue is replay authoritative",
  async () => {
    const engine =
      await loadEngine();

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
      engine.MAX_CONTINUES,
      3
    );

    const seed =
      0x12345678;

    const terminal =
      playUntilEnded(
        engine,
        engine.createGameState({
          seed,
        }),
        engine
          .createReplayTranscript(
            seed
          )
      );

    const event =
      engine
        .createReplayContinue(
          terminal.state
        );

    const replay =
      engine
        .appendReplayContinue(
          terminal.replay,
          event
        );

    const direct =
      engine.applyContinue(
        terminal.state
      ).state;

    const replayed =
      engine
        .replayTranscript(
          replay
        ).state;

    assert.deepEqual(
      replayed,
      direct
    );

    assert.equal(
      replayed.ended,
      false
    );

    assert.equal(
      replayed
        .continuesUsed,
      1
    );
  }
);
