"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

test("Revival Service authority contract", async (t) => {
  const root = path.resolve(__dirname, "../../../..");

  const repoPath = require.resolve(
    path.join(
      root,
      "services/games/revival/repositories/cingOfflineReviveRepository"
    )
  );

  const servicePath = require.resolve(
    path.join(
      root,
      "services/games/revival/cingOfflineReviveService"
    )
  );

  const previousRepo = require.cache[repoPath];
  const previousService = require.cache[servicePath];

  const calls = [];
  let response = { applied: true };
  let failure = null;

  const fakeRepository = Object.fromEntries(
    [
      "startOfflineReviveSession",
      "markOfflineRevivePending",
      "applyOfflineRevival",
    ].map((name) => [
      name,
      async (args) => {
        calls.push({ name, args });
        if (failure) throw failure;
        return response;
      },
    ])
  );

  const fakeModule = new Module(repoPath);

  fakeModule.filename = repoPath;
  fakeModule.loaded = true;
  fakeModule.exports = fakeRepository;

  require.cache[repoPath] = fakeModule;
  delete require.cache[servicePath];

  const customer = {
    id: "customer-id-must-not-be-used",
    phone: "84912345678",
  };

  const session =
    "11111111-1111-4111-8111-111111111111";

  const startRequest =
    "22222222-2222-4222-8222-222222222222";

  const pendingRequest =
    "33333333-3333-4333-8333-333333333333";

  const applyRequest =
    "44444444-4444-4444-8444-444444444444";

  function reset() {
    calls.length = 0;
    response = { applied: true };
    failure = null;
  }

  async function rejectsWithoutRpc(operation, expectedCode) {
    reset();

    await assert.rejects(
      operation(),
      (error) => {
        assert.equal(error.code, expectedCode);
        assert.equal(error.statusCode, 400);
        return true;
      }
    );

    assert.equal(calls.length, 0);
  }

  try {
    const service = require(servicePath);

    await t.test(
      "start uses authenticated normalized phone",
      async () => {
        reset();

        const result = await service.startOfflineRevival({
          customer,
          requestId: startRequest.toUpperCase(),
          gameKey: "black-pearl-rush",
          userId: "attacker-user-id",
        });

        assert.strictEqual(result, response);

        assert.deepEqual(calls, [{
          name: "startOfflineReviveSession",
          args: {
            userId: "0912345678",
            requestId: startRequest,
            gameKey: "black-pearl-rush",
          },
        }]);
      }
    );

    await t.test(
      "pending binds session and sequence",
      async () => {
        reset();

        await service.enterOfflineRevivePending({
          customer,
          sessionId: session,
          requestId: pendingRequest,
          expectedEventSeq: 0,
          reason: "death",
          userId: "attacker-user-id",
        });

        assert.deepEqual(calls, [{
          name: "markOfflineRevivePending",
          args: {
            userId: "0912345678",
            sessionId: session,
            requestId: pendingRequest,
            expectedEventSeq: 0,
            reason: "death",
          },
        }]);
      }
    );

    await t.test(
      "apply preserves full PostgreSQL bigint",
      async () => {
        reset();

        await service.purchaseOfflineRevival({
          customer,
          sessionId: session,
          requestId: applyRequest,
          expectedEventSeq: 1,
          pendingEventId:
            "9223372036854775807",
          creditCost: 0,
          userId: "attacker-user-id",
        });

        assert.deepEqual(calls, [{
          name: "applyOfflineRevival",
          args: {
            userId: "0912345678",
            sessionId: session,
            requestId: applyRequest,
            expectedEventSeq: 1,
            pendingEventId:
              "9223372036854775807",
          },
        }]);

        assert.equal(
          Object.hasOwn(calls[0].args, "creditCost"),
          false
        );
      }
    );

    await t.test(
      "missing member identity rejects before RPC",
      async () => {
        reset();

        await assert.rejects(
          service.startOfflineRevival({
            customer: { id: "customer-only" },
            requestId: startRequest,
            gameKey: "cing-stack-tower",
          }),
          {
            code: "REVIVAL_MEMBER_IDENTITY_REQUIRED",
            statusCode: 401,
          }
        );

        assert.equal(calls.length, 0);
      }
    );

    await t.test(
      "invalid request ID rejects before RPC",
      async () => {
        await rejectsWithoutRpc(
          () => service.startOfflineRevival({
            customer,
            requestId: "not-a-uuid",
            gameKey: "black-pearl-rush",
          }),
          "REVIVAL_INVALID_UUID"
        );
      }
    );

    await t.test(
      "Block Puzzle cannot use these two-game sessions",
      async () => {
        await rejectsWithoutRpc(
          () => service.startOfflineRevival({
            customer,
            requestId: startRequest,
            gameKey: "cing-block-puzzle",
          }),
          "REVIVAL_GAME_NOT_SUPPORTED"
        );
      }
    );

    await t.test(
      "invalid sequence rejects before RPC",
      async () => {
        await rejectsWithoutRpc(
          () => service.enterOfflineRevivePending({
            customer,
            sessionId: session,
            requestId: pendingRequest,
            expectedEventSeq: -1,
            reason: "death",
          }),
          "REVIVAL_INVALID_EVENT_SEQUENCE"
        );
      }
    );

    await t.test(
      "apply requires pending sequence >= 1",
      async () => {
        await rejectsWithoutRpc(
          () => service.purchaseOfflineRevival({
            customer,
            sessionId: session,
            requestId: applyRequest,
            expectedEventSeq: 0,
            pendingEventId: 3,
          }),
          "REVIVAL_INVALID_EVENT_SEQUENCE"
        );
      }
    );

    await t.test(
      "unsafe numeric event ID is rejected",
      async () => {
        await rejectsWithoutRpc(
          () => service.purchaseOfflineRevival({
            customer,
            sessionId: session,
            requestId: applyRequest,
            expectedEventSeq: 1,
            pendingEventId:
              Number.MAX_SAFE_INTEGER + 1,
          }),
          "REVIVAL_INVALID_PENDING_EVENT_ID"
        );
      }
    );

    await t.test(
      "out-of-range bigint is rejected",
      async () => {
        await rejectsWithoutRpc(
          () => service.purchaseOfflineRevival({
            customer,
            sessionId: session,
            requestId: applyRequest,
            expectedEventSeq: 1,
            pendingEventId:
              "9223372036854775808",
          }),
          "REVIVAL_INVALID_PENDING_EVENT_ID"
        );
      }
    );

    await t.test(
      "SQL business error maps to HTTP 409 once",
      async () => {
        reset();

        failure = {
          code: "P0001",
          message: "INSUFFICIENT_REVIVE_CREDITS",
        };

        await assert.rejects(
          service.purchaseOfflineRevival({
            customer,
            sessionId: session,
            requestId: applyRequest,
            expectedEventSeq: 1,
            pendingEventId: 3,
          }),
          {
            code: "INSUFFICIENT_REVIVE_CREDITS",
            statusCode: 409,
          }
        );

        assert.equal(calls.length, 1);
      }
    );

    await t.test(
      "unknown database failure is sanitized",
      async () => {
        reset();

        failure = {
          code: "XX000",
          message: "private database implementation detail",
        };

        await assert.rejects(
          service.startOfflineRevival({
            customer,
            requestId: startRequest,
            gameKey: "cing-stack-tower",
          }),
          (error) => {
            assert.equal(
              error.code,
              "REVIVAL_SERVICE_FAILED"
            );
            assert.equal(error.statusCode, 500);
            assert.equal(
              error.message.includes(
                "private database implementation detail"
              ),
              false
            );
            return true;
          }
        );

        assert.equal(calls.length, 1);
      }
    );

    await t.test(
      "known internal SQL error is sanitized",
      async () => {
        reset();

        failure = {
          code: "55000",
          message: "REVIVAL_TIMER_HISTORY_MISSING",
        };

        await assert.rejects(
          service.enterOfflineRevivePending({
            customer,
            sessionId: session,
            requestId: pendingRequest,
            expectedEventSeq: 0,
            reason: "timeout",
          }),
          (error) => {
            assert.equal(
              error.code,
              "REVIVAL_TIMER_HISTORY_MISSING"
            );
            assert.equal(error.statusCode, 500);
            assert.equal(
              error.message,
              "Không thể xử lý yêu cầu hồi sinh"
            );
            return true;
          }
        );

        assert.equal(calls.length, 1);
      }
    );

  } finally {
    delete require.cache[servicePath];

    if (previousService) {
      require.cache[servicePath] =
        previousService;
    }

    if (previousRepo) {
      require.cache[repoPath] =
        previousRepo;
    } else {
      delete require.cache[repoPath];
    }
  }
});
