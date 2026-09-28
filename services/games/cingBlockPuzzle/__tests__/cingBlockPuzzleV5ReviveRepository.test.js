const assert =
  require("node:assert/strict");

const {
  test,
} = require("node:test");

const Module =
  require("node:module");

const path =
  require("node:path");

const REPOSITORY_PATH =
  path.resolve(
    __dirname,
    "../repositories/cingBlockPuzzleV5ReviveRepository.js"
  );

const SUPABASE_PATH =
  require.resolve(
    "../../../../supabase"
  );

const FINGERPRINT =
  "a".repeat(64);

const INPUT =
  Object.freeze({
    purchaseId:
      "11111111-1111-4111-8111-111111111111",

    requestId:
      "22222222-2222-4222-8222-222222222222",

    sessionId:
      "33333333-3333-4333-8333-333333333333",

    userId:
      "v5-test-user",

    expectedContinueIndex:
      5,

    verifiedReplayFingerprint:
      FINGERPRINT,
  });

function loadWithMockSupabase(rpc) {
  const originalLoad =
    Module._load;

  try {
    Module._load = function (
      request,
      parent,
      isMain
    ) {
      const resolved =
        Module._resolveFilename(
          request,
          parent,
          isMain
        );

      if (
        resolved === SUPABASE_PATH
      ) {
        return {
          rpc,
        };
      }

      return originalLoad.call(
        this,
        request,
        parent,
        isMain
      );
    };

    delete require.cache[
      REPOSITORY_PATH
    ];

    return require(
      REPOSITORY_PATH
    );
  } finally {
    Module._load =
      originalLoad;

    delete require.cache[
      REPOSITORY_PATH
    ];
  }
}

test(
  "V5 repository calls exact financial RPC with six authoritative args",
  async () => {
    const calls = [];

    const {
      V5_REVIVE_RPC,
      applyV5ReviveAtomic,
    } = loadWithMockSupabase(
      async (
        rpcName,
        payload
      ) => {
        calls.push({
          rpcName,
          payload,
        });

        return {
          data: {
            purchase_id:
              INPUT.purchaseId,
            idempotent: false,
          },
          error: null,
        };
      }
    );

    assert.equal(
      V5_REVIVE_RPC,
      "cing_block_puzzle_v5_revive_apply_v1"
    );

    const result =
      await applyV5ReviveAtomic(
        INPUT
      );

    assert.deepEqual(
      calls,
      [
        {
          rpcName:
            "cing_block_puzzle_v5_revive_apply_v1",

          payload: {
            p_purchase_id:
              INPUT.purchaseId,

            p_request_id:
              INPUT.requestId,

            p_session_id:
              INPUT.sessionId,

            p_user_id:
              INPUT.userId,

            p_expected_continue_index:
              5,

            p_verified_replay_fingerprint:
              FINGERPRINT,
          },
        },
      ]
    );

    assert.equal(
      result.purchase_id,
      INPUT.purchaseId
    );

    assert.equal(
      result.idempotent,
      false
    );
  }
);

test(
  "V5 repository propagates financial RPC error unchanged",
  async () => {
    const dbError =
      new Error(
        "INSUFFICIENT_REVIVE_CREDITS"
      );

    const {
      applyV5ReviveAtomic,
    } = loadWithMockSupabase(
      async () => ({
        data: null,
        error: dbError,
      })
    );

    await assert.rejects(
      () =>
        applyV5ReviveAtomic(
          INPUT
        ),
      (error) =>
        error === dbError
    );
  }
);

test(
  "V5 repository accepts exact single-row array response",
  async () => {
    const {
      applyV5ReviveAtomic,
    } = loadWithMockSupabase(
      async () => ({
        data: [
          {
            purchase_id:
              INPUT.purchaseId,
          },
        ],
        error: null,
      })
    );

    const result =
      await applyV5ReviveAtomic(
        INPUT
      );

    assert.equal(
      result.purchase_id,
      INPUT.purchaseId
    );
  }
);

test(
  "V5 repository rejects empty response",
  async () => {
    const {
      applyV5ReviveAtomic,
    } = loadWithMockSupabase(
      async () => ({
        data: null,
        error: null,
      })
    );

    await assert.rejects(
      () =>
        applyV5ReviveAtomic(
          INPUT
        ),
      /invalid payload/
    );
  }
);

test(
  "V5 repository rejects multiple-row response",
  async () => {
    const {
      applyV5ReviveAtomic,
    } = loadWithMockSupabase(
      async () => ({
        data: [
          {},
          {},
        ],
        error: null,
      })
    );

    await assert.rejects(
      () =>
        applyV5ReviveAtomic(
          INPUT
        ),
      /invalid payload/
    );
  }
);

test(
  "V5 repository rejects array as normalized receipt",
  async () => {
    const {
      applyV5ReviveAtomic,
    } = loadWithMockSupabase(
      async () => ({
        data: [
          [],
        ],
        error: null,
      })
    );

    await assert.rejects(
      () =>
        applyV5ReviveAtomic(
          INPUT
        ),
      /invalid payload/
    );
  }
);
