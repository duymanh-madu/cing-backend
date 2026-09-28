const assert =
  require("node:assert/strict");

const {
  test,
} = require("node:test");

const Module =
  require("node:module");

const path =
  require("node:path");

const SERVICE_PATH =
  path.resolve(
    __dirname,
    "../cingBlockPuzzleV5ReviveService.js"
  );

const SESSION_ID =
  "11111111-1111-4111-8111-111111111111";

const REQUEST_ID =
  "22222222-2222-4222-8222-222222222222";

const PURCHASE_ID =
  "33333333-3333-4333-8333-333333333333";

const FINGERPRINT =
  "a".repeat(64);

const COSTS =
  [0, 1, 2, 4, 8, 16];

function session(
  overrides = {}
) {
  return {
    id: SESSION_ID,
    user_id: "v5-user",
    game_key: "cing-block-puzzle",
    seed: 12345,
    engine_version: 4,
    rules_version: 4,
    score_version: 3,
    replay_version: 5,
    status: "active",
    expires_at:
      "2030-01-01T00:00:00.000Z",
    continue_count: 0,
    ...overrides,
  };
}

function receipt(
  index,
  overrides = {}
) {
  const cost =
    COSTS[index];

  return {
    purchase_id: PURCHASE_ID,
    session_id: SESSION_ID,
    continue_index: index,
    credit_cost: cost,
    credit_transaction_id: "123",
    balance_before: 31,
    balance_after: 31 - cost,
    continue_count: index,
    verified_replay_fingerprint:
      FINGERPRINT,
    created_at:
      "2026-09-25T00:00:00.000Z",
    idempotent: false,
    ...overrides,
  };
}

function request() {
  return {
    customer: {
      user_id: "v5-user",
    },
    sessionId: SESSION_ID,
    body: {
      request_id: REQUEST_ID,
      replay: {
        source: "test-transcript",
      },
    },
  };
}

function harness({
  sessionRow = session(),
  verified = {
    continues_used: 0,
    replay_fingerprint:
      FINGERPRINT,
  },
  rpcRow = receipt(1),
  replayError = null,
  rpcError = null,
} = {}) {
  const calls = [];

  const mocks = {
    "./cingBlockPuzzleSessionService": {
      resolveAuthenticatedUserId:
        () => "v5-user",
    },

    "./repositories/cingBlockPuzzleSessionRepository": {
      getSessionForSubmission:
        async (id) => {
          calls.push(
            ["session", id]
          );

          return sessionRow;
        },
    },

    "./domain/cingBlockPuzzleReplayAuthority": {
      verifyReplayAuthority:
        async (options) => {
          calls.push(
            ["verify", options]
          );

          if (
            replayError
          ) {
            throw replayError;
          }

          return verified;
        },
    },

    "./repositories/cingBlockPuzzleV5ReviveRepository": {
      applyV5ReviveAtomic:
        async (options) => {
          calls.push(
            ["rpc", options]
          );

          if (
            rpcError
          ) {
            throw rpcError;
          }

          return rpcRow;
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
          SERVICE_PATH &&
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
      SERVICE_PATH
    ];

    const service =
      require(
        SERVICE_PATH
      );

    return {
      service,
      calls,
    };
  } finally {
    Module._load =
      originalLoad;

    delete require.cache[
      SERVICE_PATH
    ];
  }
}

test(
  "V5 verifies replay before financial RPC",
  async () => {
    const {
      service,
      calls,
    } = harness();

    const result =
      await service.purchaseV5GameplayRevive(
        request()
      );

    assert.deepEqual(
      calls.map(
        ([name]) => name
      ),
      [
        "session",
        "verify",
        "rpc",
      ]
    );

    assert.equal(
      result.credit_cost,
      1
    );

    assert.equal(
      result.idempotent,
      false
    );
  }
);

test(
  "V5 replay uses durable seed and exact tuple",
  async () => {
    const {
      service,
      calls,
    } = harness();

    await service.purchaseV5GameplayRevive(
      request()
    );

    const verification =
      calls.find(
        ([name]) =>
          name === "verify"
      )[1];

    assert.deepEqual(
      verification,
      {
        transcript: {
          source:
            "test-transcript",
        },
        expectedSeed: 12345,
        engineVersion: 4,
        rulesVersion: 4,
        scoreVersion: 3,
        replayVersion: 5,
        requireEnded: true,
      }
    );
  }
);

test(
  "V5 financial RPC receives server verified fingerprint",
  async () => {
    const {
      service,
      calls,
    } = harness();

    await service.purchaseV5GameplayRevive(
      request()
    );

    const payload =
      calls.find(
        ([name]) =>
          name === "rpc"
      )[1];

    assert.equal(
      payload.requestId,
      REQUEST_ID
    );

    assert.equal(
      payload.expectedContinueIndex,
      1
    );

    assert.equal(
      payload.verifiedReplayFingerprint,
      FINGERPRINT
    );

    assert.equal(
      payload.sessionId,
      SESSION_ID
    );

    assert.equal(
      payload.userId,
      "v5-user"
    );

    assert.match(
      payload.purchaseId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  }
);

test(
  "V5 does not call financial RPC after replay failure",
  async () => {
    const replayError =
      Object.assign(
        new Error(
          "invalid replay"
        ),
        {
          code:
            "BLOCK_PUZZLE_INVALID_REPLAY",
        }
      );

    const {
      service,
      calls,
    } = harness({
      replayError,
    });

    await assert.rejects(
      () =>
        service.purchaseV5GameplayRevive(
          request()
        ),
      (error) =>
        error === replayError &&
        error.statusCode === 400
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
  "V4 session cannot use V5 service",
  async () => {
    const {
      service,
      calls,
    } = harness({
      sessionRow: session({
        engine_version: 3,
        rules_version: 3,
        replay_version: 4,
      }),
    });

    await assert.rejects(
      () =>
        service.purchaseV5GameplayRevive(
          request()
        ),
      /version/
    );

    assert.deepEqual(
      calls.map(
        ([name]) => name
      ),
      ["session"]
    );
  }
);

test(
  "five V5 Continue indices derived from verified replay",
  async () => {
    for (
      let used = 0;
      used <= 4;
      used += 1
    ) {
      const index =
        used + 1;

      const {
        service,
        calls,
      } = harness({
        sessionRow: session({
          continue_count: used,
        }),

        verified: {
          continues_used: used,
          replay_fingerprint:
            FINGERPRINT,
        },

        rpcRow:
          receipt(index),
      });

      const result =
        await service.purchaseV5GameplayRevive(
          request()
        );

      assert.equal(
        result.continue_index,
        index
      );

      const payload =
        calls.find(
          ([name]) =>
            name === "rpc"
        )[1];

      assert.equal(
        payload.expectedContinueIndex,
        index
      );
    }
  }
);

test(
  "sixth Continue rejected before financial RPC",
  async () => {
    const {
      service,
      calls,
    } = harness({
      sessionRow: session({
        continue_count: 5,
      }),

      verified: {
        continues_used: 5,
        replay_fingerprint:
          FINGERPRINT,
      },
    });

    await assert.rejects(
      () =>
        service.purchaseV5GameplayRevive(
          request()
        ),
      (error) =>
        error.code ===
          "BLOCK_PUZZLE_CONTINUE_LIMIT_REACHED"
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
  "historical first Continue retry reaches SQL after fifth Continue",
  async () => {
    const {
      service,
      calls,
    } = harness({
      sessionRow: session({
        continue_count: 5,
      }),

      verified: {
        continues_used: 0,
        replay_fingerprint:
          FINGERPRINT,
      },

      rpcRow:
        receipt(
          1,
          {
            idempotent: true,
          }
        ),
    });

    const result =
      await service.purchaseV5GameplayRevive(
        request()
      );

    assert.equal(
      result.idempotent,
      true
    );

    assert.equal(
      calls.find(
        ([name]) =>
          name === "rpc"
      )[1].expectedContinueIndex,
      1
    );
  }
);

test(
  "historical retry reaches SQL on submitted session",
  async () => {
    const {
      service,
      calls,
    } = harness({
      sessionRow: session({
        status: "submitted",
        continue_count: 3,
      }),

      rpcRow:
        receipt(
          1,
          {
            idempotent: true,
          }
        ),
    });

    const result =
      await service.purchaseV5GameplayRevive(
        request()
      );

    assert.equal(
      result.idempotent,
      true
    );

    assert.equal(
      calls.some(
        ([name]) =>
          name === "rpc"
      ),
      true
    );
  }
);

test(
  "historical retry reaches SQL on expired session",
  async () => {
    const {
      service,
      calls,
    } = harness({
      sessionRow: session({
        status: "expired",
        expires_at:
          "2020-01-01T00:00:00.000Z",
        continue_count: 2,
      }),

      rpcRow:
        receipt(
          1,
          {
            idempotent: true,
          }
        ),
    });

    const result =
      await service.purchaseV5GameplayRevive(
        request()
      );

    assert.equal(
      result.idempotent,
      true
    );

    assert.equal(
      calls.some(
        ([name]) =>
          name === "rpc"
      ),
      true
    );
  }
);

test(
  "future unpurchased Continue rejected before RPC",
  async () => {
    const {
      service,
      calls,
    } = harness({
      sessionRow: session({
        continue_count: 0,
      }),

      verified: {
        continues_used: 1,
        replay_fingerprint:
          FINGERPRINT,
      },
    });

    await assert.rejects(
      () =>
        service.purchaseV5GameplayRevive(
          request()
        ),
      (error) =>
        error.code ===
          "BLOCK_PUZZLE_CONTINUE_PURCHASE_MISMATCH"
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
  "insufficient Revive Credit maps without loyalty terminology",
  async () => {
    const dbError =
      new Error(
        "INSUFFICIENT_REVIVE_CREDITS"
      );

    const {
      service,
    } = harness({
      rpcError: dbError,
    });

    await assert.rejects(
      () =>
        service.purchaseV5GameplayRevive(
          request()
        ),
      (error) =>
        error === dbError &&
        error.code ===
          "INSUFFICIENT_REVIVE_CREDITS" &&
        error.statusCode === 409 &&
        !error.message.includes(
          "điểm"
        )
    );
  }
);

test(
  "same-request fingerprint conflict maps to 409",
  async () => {
    const {
      service,
    } = harness({
      rpcError:
        new Error(
          "BLOCK_PUZZLE_V5_REVIVE_REQUEST_CONFLICT"
        ),
    });

    await assert.rejects(
      () =>
        service.purchaseV5GameplayRevive(
          request()
        ),
      (error) =>
        error.code ===
          "BLOCK_PUZZLE_V5_REVIVE_REQUEST_CONFLICT" &&
        error.statusCode === 409
    );
  }
);

test(
  "financial receipt mismatch fails closed",
  async () => {
    const {
      service,
    } = harness({
      rpcRow:
        receipt(
          1,
          {
            verified_replay_fingerprint:
              "b".repeat(64),
          }
        ),
    });

    await assert.rejects(
      () =>
        service.purchaseV5GameplayRevive(
          request()
        ),
      (error) =>
        error.code ===
          "BLOCK_PUZZLE_V5_REVIVE_AUTHORITY_MISMATCH"
    );
  }
);

test(
  "missing session cannot reach financial RPC",
  async () => {
    const {
      service,
      calls,
    } = harness({
      sessionRow: null,
    });

    await assert.rejects(
      () =>
        service.purchaseV5GameplayRevive(
          request()
        ),
      (error) =>
        error.code ===
          "BLOCK_PUZZLE_SESSION_NOT_FOUND"
    );

    assert.deepEqual(
      calls.map(
        ([name]) => name
      ),
      ["session"]
    );
  }
);
