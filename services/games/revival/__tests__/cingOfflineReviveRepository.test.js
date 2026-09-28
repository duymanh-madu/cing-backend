"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

/*
 * Inject a mock into Node's module cache BEFORE
 * loading the repository.
 *
 * The real Supabase client is never evaluated.
 * No network, env or database access is required.
 */

test(
  "offline revival repository uses exact RPC contract",
  async (t) => {
    const root = path.resolve(__dirname, "../../../..");

    const supabasePath = require.resolve(
      path.join(root, "supabase")
    );

    const repositoryPath = require.resolve(
      path.join(
        root,
        "services/games/revival/repositories/cingOfflineReviveRepository"
      )
    );

    const previousSupabase =
      require.cache[supabasePath];

    const previousRepository =
      require.cache[repositoryPath];

    const calls = [];

    let nextResponse = {
      data: null,
      error: null,
    };

    const fakeSupabase = {
      async rpc(name, parameters) {
        calls.push({
          name,
          parameters,
        });

        return nextResponse;
      },
    };

    const fakeModule = new Module(
      supabasePath
    );

    fakeModule.filename = supabasePath;
    fakeModule.loaded = true;
    fakeModule.exports = fakeSupabase;

    require.cache[supabasePath] =
      fakeModule;

    delete require.cache[repositoryPath];

    try {
      const repository =
        require(repositoryPath);

      const {
        startOfflineReviveSession,
        markOfflineRevivePending,
        applyOfflineRevival,
      } = repository;

      function arrange(response) {
        calls.length = 0;
        nextResponse = response;
      }

      await t.test(
        "start passes authenticated user and exact parameters",
        async () => {
          const row = {
            applied: true,
            session_id:
              "11111111-1111-4111-8111-111111111111",
            game_key: "black-pearl-rush",
            session_status: "active",
            revives_used: 0,
            event_seq: 0,
          };

          arrange({
            data: [row],
            error: null,
          });

          const result =
            await startOfflineReviveSession({
              userId: "0912345678",
              requestId:
                "22222222-2222-4222-8222-222222222222",
              gameKey:
                "black-pearl-rush",
            });

          assert.deepEqual(
            result,
            row
          );

          assert.deepEqual(
            calls,
            [
              {
                name:
                  "cing_offline_revive_start_v1",
                parameters: {
                  p_user_id:
                    "0912345678",
                  p_request_id:
                    "22222222-2222-4222-8222-222222222222",
                  p_game_key:
                    "black-pearl-rush",
                },
              },
            ]
          );
        }
      );

      await t.test(
        "pending passes session, event sequence and reason",
        async () => {
          const row = {
            applied: true,
            event_id: 3,
            event_seq: 1,
            session_status:
              "revive_pending",
            pending_reason:
              "death",
          };

          arrange({
            data: row,
            error: null,
          });

          const result =
            await markOfflineRevivePending({
              userId:
                "0912345678",
              sessionId:
                "11111111-1111-4111-8111-111111111111",
              requestId:
                "33333333-3333-4333-8333-333333333333",
              expectedEventSeq: 0,
              reason: "death",
            });

          assert.deepEqual(
            result,
            row
          );

          assert.deepEqual(
            calls,
            [
              {
                name:
                  "cing_offline_revive_pending_v1",
                parameters: {
                  p_user_id:
                    "0912345678",
                  p_session_id:
                    "11111111-1111-4111-8111-111111111111",
                  p_request_id:
                    "33333333-3333-4333-8333-333333333333",
                  p_expected_event_seq:
                    0,
                  p_reason:
                    "death",
                },
              },
            ]
          );
        }
      );

      await t.test(
        "apply binds exact pending event without client price",
        async () => {
          const row = {
            applied: true,
            event_id: 4,
            event_seq: 2,
            revive_index: 1,
            credit_cost: 1,
            balance_after: 30,
            session_status:
              "active",
          };

          arrange({
            data: [row],
            error: null,
          });

          const result =
            await applyOfflineRevival({
              userId:
                "0912345678",
              sessionId:
                "11111111-1111-4111-8111-111111111111",
              requestId:
                "44444444-4444-4444-8444-444444444444",
              expectedEventSeq: 1,
              pendingEventId: 3,
            });

          assert.deepEqual(
            result,
            row
          );

          assert.deepEqual(
            calls,
            [
              {
                name:
                  "cing_offline_revive_apply_v1",
                parameters: {
                  p_user_id:
                    "0912345678",
                  p_session_id:
                    "11111111-1111-4111-8111-111111111111",
                  p_request_id:
                    "44444444-4444-4444-8444-444444444444",
                  p_expected_event_seq:
                    1,
                  p_pending_event_id:
                    3,
                },
              },
            ]
          );

          assert.equal(
            Object.hasOwn(
              calls[0].parameters,
              "p_credit_cost"
            ),
            false
          );
        }
      );

      await t.test(
        "database error propagates unchanged without retry",
        async () => {
          const pgError = {
            code: "P0001",
            message:
              "INSUFFICIENT_REVIVE_CREDITS",
            details: null,
          };

          arrange({
            data: null,
            error: pgError,
          });

          await assert.rejects(
            applyOfflineRevival({
              userId:
                "0912345678",
              sessionId:
                "11111111-1111-4111-8111-111111111111",
              requestId:
                "55555555-5555-4555-8555-555555555555",
              expectedEventSeq: 1,
              pendingEventId: 3,
            }),
            (error) => {
              assert.strictEqual(
                error,
                pgError
              );

              return true;
            }
          );

          assert.equal(
            calls.length,
            1
          );

          assert.equal(
            calls[0].name,
            "cing_offline_revive_apply_v1"
          );
        }
      );

      await t.test(
        "empty result is rejected without repeat mutation",
        async () => {
          arrange({
            data: [],
            error: null,
          });

          await assert.rejects(
            startOfflineReviveSession({
              userId:
                "0912345678",
              requestId:
                "66666666-6666-4666-8666-666666666666",
              gameKey:
                "cing-stack-tower",
            }),
            (error) => {
              assert.equal(
                error.code,
                "REVIVAL_RPC_INVALID_PAYLOAD"
              );

              assert.equal(
                error.statusCode,
                500
              );

              return true;
            }
          );

          assert.equal(
            calls.length,
            1
          );
        }
      );

      await t.test(
        "null result is rejected",
        async () => {
          arrange({
            data: null,
            error: null,
          });

          await assert.rejects(
            markOfflineRevivePending({
              userId:
                "0912345678",
              sessionId:
                "11111111-1111-4111-8111-111111111111",
              requestId:
                "77777777-7777-4777-8777-777777777777",
              expectedEventSeq: 0,
              reason:
                "timeout",
            }),
            {
              code:
                "REVIVAL_RPC_INVALID_PAYLOAD",
              statusCode: 500,
            }
          );

          assert.equal(
            calls.length,
            1
          );
        }
      );

    } finally {
      delete require.cache[repositoryPath];

      if (previousRepository) {
        require.cache[repositoryPath] =
          previousRepository;
      }

      if (previousSupabase) {
        require.cache[supabasePath] =
          previousSupabase;
      } else {
        delete require.cache[supabasePath];
      }
    }
  }
);
