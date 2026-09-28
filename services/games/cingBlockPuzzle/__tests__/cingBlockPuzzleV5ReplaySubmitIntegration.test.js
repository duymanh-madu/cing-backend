const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const Module =
  require("node:module");

/*
 * Test-only isolation must be installed BEFORE any Block Puzzle
 * runtime/domain module is required.
 *
 * Some transitive post-commit dependencies load the shared Redis
 * client at module initialization. This integration test verifies
 * deterministic replay + submit authority and must not open a real
 * Redis connection.
 */
const ORIGINAL_MODULE_LOAD =
  Module._load;

const TEST_REDIS_NOOP =
  new Proxy(
    function () {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return undefined;
        }

        if (prop === "status") {
          return "ready";
        }

        if (prop === "connected") {
          return true;
        }

        return (..._args) =>
          TEST_REDIS_NOOP;
      },

      apply() {
        return TEST_REDIS_NOOP;
      },
    }
  );

Module._load = function (
  name,
  parent,
  isMain
) {
  if (
    typeof name === "string" &&
    (
      name.includes(
        "infrastructure/cache/redisClient"
      ) ||
      name.includes(
        "infrastructure/cache/redisPublisher"
      )
    )
  ) {
    return TEST_REDIS_NOOP;
  }

  return ORIGINAL_MODULE_LOAD.call(
    this,
    name,
    parent,
    isMain
  );
};

const path =
  require("node:path");

const {
  pathToFileURL,
} = require("node:url");

const {
  verifyReplayAuthority,
} = require(
  "../domain/cingBlockPuzzleReplayAuthority"
);

const {
  normalizeVerifiedReplayResult,
} = require(
  "../domain/cingBlockPuzzleSubmissionContracts"
);

const SESSION_ID =
  "11111111-1111-4111-8111-111111111111";

const SCORE_ID =
  "22222222-2222-4222-8222-222222222222";

const SEED =
  0x24681357;

const USER_ID =
  "0912345678";

const FE_ROOT =
  path.join(
    process.env.CING_V5_FE_ROOT,
    "src/games/cing-block-puzzle"
  );

const RUNTIME_PATH =
  path.join(
    FE_ROOT,
    "runtime/blockPuzzleSessionRuntime.js"
  );

const ENGINE_PATH =
  path.join(
    FE_ROOT,
    "engine/v5/index.js"
  );

const SUBMIT_PATH =
  path.resolve(
    __dirname,
    "../cingBlockPuzzleSubmitService.js"
  );

const session = {
  id: SESSION_ID,
  session_id: SESSION_ID,

  user_id: USER_ID,

  game_key:
    "cing-block-puzzle",

  seed: SEED,

  engine_version: 4,
  rules_version: 4,
  score_version: 3,
  replay_version: 5,

  play_cost: 0,

  status: "active",

  created_at:
    "2026-09-25T00:00:00.000Z",

  expires_at:
    "2099-01-01T00:00:00.000Z",

  submitted_at: null,
  verified_score: null,
  replay_fingerprint: null,
  move_count: null,

  continue_count: 0,
};

let frontendPromise;

async function frontend() {
  if (!frontendPromise) {
    frontendPromise =
      Promise.all([
        import(
          pathToFileURL(
            RUNTIME_PATH
          ).href
        ),

        import(
          pathToFileURL(
            ENGINE_PATH
          ).href
        ),
      ]).then(
        ([runtime, engine]) => ({
          ...runtime,
          engine,
        })
      );
  }

  return frontendPromise;
}

function firstLegalMove(
  state,
  engine
) {
  for (
    let trayIndex = 0;
    trayIndex < state.tray.length;
    trayIndex += 1
  ) {
    const piece =
      state.tray[trayIndex];

    if (!piece) {
      continue;
    }

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

function playUntilTerminal(
  original,
  api,
  label
) {
  let runtime = original;

  for (
    let guard = 0;
    guard < 5000 &&
    !runtime.state.ended;
    guard += 1
  ) {
    const move =
      firstLegalMove(
        runtime.state,
        api.engine
      );

    assert.ok(
      move,
      label +
      ": playable state requires legal move"
    );

    runtime =
      api.applyAuthorizedBlockPuzzleMove(
        runtime,
        move
      );
  }

  assert.equal(
    runtime.state.ended,
    true,
    label +
    ": actual terminal state required"
  );

  return runtime;
}

async function verify(
  replay
) {
  return verifyReplayAuthority({
    transcript: replay,

    expectedSeed:
      SEED,

    engineVersion: 4,
    rulesVersion: 4,
    scoreVersion: 3,
    replayVersion: 5,

    requireEnded: true,
  });
}

async function buildFiveContinueGame() {
  const api =
    await frontend();

  let runtime =
    api.createAuthorizedBlockPuzzleRuntime({
      ...session,
    });

  const prefixes = [];

  for (
    let index = 1;
    index <= 5;
    index += 1
  ) {
    runtime =
      playUntilTerminal(
        runtime,
        api,
        "Continue " + index
      );

    const verified =
      await verify(
        runtime.replay
      );

    assert.equal(
      verified.continues_used,
      index - 1
    );

    assert.equal(
      verified.score,
      runtime.state.score
    );

    assert.equal(
      verified.move_count,
      runtime.state.moves
    );

    assert.equal(
      verified.ended,
      true
    );

    prefixes.push({
      index,
      replay:
        runtime.replay,

      fingerprint:
        verified.replay_fingerprint,
    });

    runtime =
      api.applyAuthorizedBlockPuzzleContinue(
        runtime,
        {
          session_id:
            SESSION_ID,

          continue_index:
            index,

          continue_count:
            index,
        }
      );

    assert.equal(
      runtime.state.continuesUsed,
      index
    );

    assert.equal(
      runtime.state.ended,
      false
    );
  }

  runtime =
    playUntilTerminal(
      runtime,
      api,
      "Final game over"
    );

  const verified =
    await verify(
      runtime.replay
    );

  assert.equal(
    verified.continues_used,
    5
  );

  assert.equal(
    verified.score,
    runtime.state.score
  );

  assert.equal(
    verified.move_count,
    runtime.state.moves
  );

  assert.equal(
    runtime.replay.events.filter(
      (event) =>
        event.type ===
        "continue"
    ).length,
    5
  );

  return {
    runtime,
    verified,
    prefixes,
  };
}

function loadSubmitServiceHarness({
  sessionRow,
  rpc,
}) {
  const calls = [];

  const mocks = {
    "./cingBlockPuzzleSessionService": {
      resolveAuthenticatedUserId:
        (customer) =>
          customer?.phone,
    },

    "./repositories/cingBlockPuzzleSessionRepository": {
      getSessionForSubmission:
        async (id) => {
          calls.push(
            ["session", id]
          );

          return sessionRow;
        },

      submitSessionAtomic:
        async (args) => {
          calls.push(
            ["rpc", args]
          );

          return rpc(args);
        },
    },
  };

  const originalLoad =
    Module._load;

  try {
    Module._load = function (
      name,
      parent,
      isMain
    ) {
      if (
        parent?.filename ===
          SUBMIT_PATH &&
        Object.prototype.hasOwnProperty.call(
          mocks,
          name
        )
      ) {
        return mocks[name];
      }

      return originalLoad.call(
        this,
        name,
        parent,
        isMain
      );
    };

    delete require.cache[
      SUBMIT_PATH
    ];

    const service =
      require(
        SUBMIT_PATH
      );

    return {
      service,
      calls,
    };
  } finally {
    Module._load =
      originalLoad;

    delete require.cache[
      SUBMIT_PATH
    ];
  }
}

function submissionRequest(
  replay,
  customer = {
    phone: USER_ID,
  }
) {
  return {
    customer,

    sessionId:
      SESSION_ID,

    body: {
      replay,
    },
  };
}

test(
  "five real frontend Continues verify independently on backend",
  async () => {
    const game =
      await buildFiveContinueGame();

    assert.equal(
      game.prefixes.length,
      5
    );

    assert.equal(
      game.verified.continues_used,
      5
    );

    assert.equal(
      game.verified.ended,
      true
    );

    assert.equal(
      game.verified.replay_fingerprint.length,
      64
    );
  }
);

test(
  "real V5 terminal replay reaches submit RPC with server-derived authority",
  async () => {
    const game =
      await buildFiveContinueGame();

    const {
      service,
      calls,
    } = loadSubmitServiceHarness({
      sessionRow: {
        ...session,
        continue_count: 5,
      },

      rpc: async (args) => ({
        session_id:
          SESSION_ID,

        score_id:
          SCORE_ID,

        verified_score:
          args.verifiedScore,

        replay_fingerprint:
          args.replayFingerprint,

        move_count:
          args.moveCount,

        submitted_at:
          "2026-09-26T00:00:00.000Z",

        idempotent:
          false,
      }),
    });

    const result =
      await service.submitGameplaySession(
        submissionRequest(
          game.runtime.replay
        )
      );

    const rpcCalls =
      calls.filter(
        ([name]) =>
          name === "rpc"
      );

    assert.equal(
      rpcCalls.length,
      1
    );

    const authority =
      rpcCalls[0][1];

    assert.equal(
      authority.sessionId,
      SESSION_ID
    );

    assert.equal(
      authority.userId,
      USER_ID
    );

    assert.equal(
      authority.verifiedScore,
      game.verified.score
    );

    assert.equal(
      authority.replayFingerprint,
      game.verified.replay_fingerprint
    );

    assert.equal(
      authority.moveCount,
      game.verified.move_count
    );

    assert.equal(
      authority.continuesUsed,
      5
    );

    assert.equal(
      authority.bestCombo,
      game.verified.best_combo
    );

    assert.equal(
      authority.totalLinesCleared,
      game.verified.total_lines_cleared
    );

    assert.equal(
      result.verified_score,
      game.verified.score
    );

    assert.equal(
      result.idempotent,
      false
    );
  }
);

test(
  "V5 submit rejects replay with unpurchased Continue before RPC",
  async () => {
    const game =
      await buildFiveContinueGame();

    const {
      service,
      calls,
    } = loadSubmitServiceHarness({
      sessionRow: {
        ...session,
        continue_count: 4,
      },

      rpc: async () => {
        throw new Error(
          "RPC MUST NOT RUN"
        );
      },
    });

    await assert.rejects(
      () =>
        service.submitGameplaySession(
          submissionRequest(
            game.runtime.replay
          )
        ),
      {
        code:
          "BLOCK_PUZZLE_CONTINUE_PURCHASE_MISMATCH",

        statusCode:
          409,
      }
    );

    assert.equal(
      calls.some(
        ([name]) =>
          name === "rpc"
      ),
      false
    );
  }
);

test(
  "V5 submit rejects tampered replay before RPC",
  async () => {
    const game =
      await buildFiveContinueGame();

    const tampered =
      structuredClone(
        game.runtime.replay
      );

    const move =
      tampered.events.find(
        (event) =>
          event.type ===
          "move"
      );

    assert.ok(move);

    move.pieceInstanceId =
      "forged-piece";

    const {
      service,
      calls,
    } = loadSubmitServiceHarness({
      sessionRow: {
        ...session,
        continue_count: 5,
      },

      rpc: async () => {
        throw new Error(
          "RPC MUST NOT RUN"
        );
      },
    });

    await assert.rejects(
      () =>
        service.submitGameplaySession(
          submissionRequest(
            tampered
          )
        )
    );

    assert.equal(
      calls.some(
        ([name]) =>
          name === "rpc"
      ),
      false
    );
  }
);

test(
  "V5 submit rejects wrong owner before RPC",
  async () => {
    const game =
      await buildFiveContinueGame();

    const {
      service,
      calls,
    } = loadSubmitServiceHarness({
      sessionRow: {
        ...session,
        continue_count: 5,
      },

      rpc: async () => {
        throw new Error(
          "RPC MUST NOT RUN"
        );
      },
    });

    await assert.rejects(
      () =>
        service.submitGameplaySession(
          submissionRequest(
            game.runtime.replay,
            {
              phone:
                "0999999999",
            }
          )
        ),
      {
        code:
          "BLOCK_PUZZLE_SESSION_OWNERSHIP_MISMATCH",

        statusCode:
          403,
      }
    );

    assert.equal(
      calls.some(
        ([name]) =>
          name === "rpc"
      ),
      false
    );
  }
);

test(
  "V5 submitted retry re-verifies replay and reaches idempotent RPC",
  async () => {
    const game =
      await buildFiveContinueGame();

    const {
      service,
      calls,
    } = loadSubmitServiceHarness({
      sessionRow: {
        ...session,

        status:
          "submitted",

        continue_count:
          5,

        submitted_at:
          "2026-09-26T00:00:00.000Z",

        verified_score:
          game.verified.score,

        replay_fingerprint:
          game.verified.replay_fingerprint,

        move_count:
          game.verified.move_count,
      },

      rpc: async (args) => ({
        session_id:
          SESSION_ID,

        score_id:
          SCORE_ID,

        verified_score:
          args.verifiedScore,

        replay_fingerprint:
          args.replayFingerprint,

        move_count:
          args.moveCount,

        submitted_at:
          "2026-09-26T00:00:00.000Z",

        idempotent:
          true,
      }),
    });

    const result =
      await service.submitGameplaySession(
        submissionRequest(
          game.runtime.replay
        )
      );

    assert.equal(
      result.idempotent,
      true
    );

    assert.equal(
      calls.filter(
        ([name]) =>
          name === "rpc"
      ).length,
      1
    );
  }
);

test(
  "unfinished V5 replay is rejected by backend verifier",
  async () => {
    const api =
      await frontend();

    const runtime =
      api.createAuthorizedBlockPuzzleRuntime({
        ...session,
      });

    await assert.rejects(
      () =>
        verify(
          runtime.replay
        ),
      {
        code:
          "BLOCK_PUZZLE_REPLAY_NOT_FINISHED",
      }
    );
  }
);

test(
  "V5 replay with incorrect session seed is rejected",
  async () => {
    const game =
      await buildFiveContinueGame();

    const tampered =
      structuredClone(
        game.runtime.replay
      );

    tampered.seed =
      SEED + 1;

    await assert.rejects(
      () =>
        verify(
          tampered
        ),
      {
        code:
          "BLOCK_PUZZLE_REPLAY_SESSION_MISMATCH",
      }
    );
  }
);
