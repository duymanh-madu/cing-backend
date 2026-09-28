"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const ROOT = path.resolve(__dirname, "../../../..");

const REPO = path.join(
  ROOT,
  "services/games/revival/repositories/cingOfflineReviveRepository"
);

const SERVICE = path.join(
  ROOT,
  "services/games/revival/cingOfflineReviveService"
);

const SESSION =
  "11111111-1111-4111-8111-111111111111";

const REQUEST =
  "22222222-2222-4222-8222-222222222222";

const CUSTOMER = Object.freeze({
  id: "customer-id-not-financial-identity",
  phone: "84912345678",
});

function withMock(filename, exports) {
  const resolved = require.resolve(filename);
  const previous = require.cache[resolved];

  const fake = new Module(resolved);

  fake.filename = resolved;
  fake.loaded = true;
  fake.exports = exports;

  require.cache[resolved] = fake;

  return () => {
    delete require.cache[resolved];

    if (previous) {
      require.cache[resolved] = previous;
    }
  };
}

test(
  "Finalize repository invokes exact SQL authority",
  async (t) => {
    const supabasePath =
      require.resolve(path.join(ROOT, "supabase"));

    const repoPath = require.resolve(REPO);

    const previousRepo = require.cache[repoPath];

    const calls = [];

    let reply = {
      data: null,
      error: null,
    };

    const restoreSupabase = withMock(
      supabasePath,
      {
        async rpc(name, params) {
          calls.push({ name, params });
          return reply;
        },
      }
    );

    delete require.cache[repoPath];

    try {
      const repo = require(repoPath);

      const args = {
        userId: "0912345678",
        sessionId: SESSION,
        requestId: REQUEST,
        expectedEventSeq: 1,
        finalScore: 0,
        finalBestCombo: 0,
        playerName: "Cing iu",
        avatar: "",
      };

      const applied = {
        applied: true,
        session_id: SESSION,
        event_id: "9223372036854775807",
        event_seq: 2,
        score_id: "9223372036854775806",
        final_score: 0,
        final_best_combo: 0,
        session_status: "finalized",
      };

      await t.test(
        "passes exactly eight SQL parameters",
        async () => {
          calls.length = 0;

          reply = {
            data: [applied],
            error: null,
          };

          const result =
            await repo.finalizeOfflineReviveSession(
              args
            );

          assert.strictEqual(
            result,
            applied
          );

          assert.deepEqual(calls, [
            {
              name:
                "cing_offline_revive_finalize_v1",
              params: {
                p_user_id: "0912345678",
                p_session_id: SESSION,
                p_request_id: REQUEST,
                p_expected_event_seq: 1,
                p_final_score: 0,
                p_final_best_combo: 0,
                p_player_name: "Cing iu",
                p_avatar: "",
              },
            },
          ]);
        }
      );

      await t.test(
        "preserves idempotent replay and bigint strings",
        async () => {
          calls.length = 0;

          const replay = {
            ...applied,
            applied: false,
          };

          reply = {
            data: replay,
            error: null,
          };

          const result =
            await repo.finalizeOfflineReviveSession(
              args
            );

          assert.strictEqual(
            result,
            replay
          );

          assert.equal(
            result.score_id,
            "9223372036854775806"
          );

          assert.equal(
            result.event_id,
            "9223372036854775807"
          );

          assert.equal(calls.length, 1);
        }
      );

      await t.test(
        "propagates database error without retry",
        async () => {
          calls.length = 0;

          const error = {
            code: "23505",
            message:
              "REVIVAL_FINALIZE_REQUEST_CONFLICT",
          };

          reply = {
            data: null,
            error,
          };

          await assert.rejects(
            repo.finalizeOfflineReviveSession(
              args
            ),
            (actual) => actual === error
          );

          assert.equal(calls.length, 1);
        }
      );

      await t.test(
        "rejects missing RPC payload without retry",
        async () => {
          calls.length = 0;

          reply = {
            data: [],
            error: null,
          };

          await assert.rejects(
            repo.finalizeOfflineReviveSession(
              args
            ),
            {
              code:
                "REVIVAL_RPC_INVALID_PAYLOAD",
              statusCode: 500,
            }
          );

          assert.equal(calls.length, 1);
        }
      );
    } finally {
      delete require.cache[repoPath];

      if (previousRepo) {
        require.cache[repoPath] =
          previousRepo;
      }

      restoreSupabase();
    }
  }
);

test(
  "Finalize service enforces authenticated contract",
  async (t) => {
    const repoPath = require.resolve(REPO);
    const servicePath =
      require.resolve(SERVICE);

    const previousService =
      require.cache[servicePath];

    const calls = [];

    let response = {
      applied: true,
      final_score: 0,
      final_best_combo: 0,
    };

    let failure = null;

    const restoreRepo = withMock(
      repoPath,
      {
        async finalizeOfflineReviveSession(
          args
        ) {
          calls.push(args);

          if (failure) {
            throw failure;
          }

          return response;
        },
      }
    );

    delete require.cache[servicePath];

    const base = {
      customer: CUSTOMER,
      sessionId: SESSION,
      requestId: REQUEST,
      expectedEventSeq: 1,
      finalScore: 0,
      finalBestCombo: 0,
    };

    function reset() {
      calls.length = 0;
      failure = null;
      response = {
        applied: true,
        final_score: 0,
        final_best_combo: 0,
      };
    }

    async function rejectBeforeRpc(
      changes,
      code,
      statusCode = 400
    ) {
      reset();

      await assert.rejects(
        require(servicePath)
          .finalizeOfflineRevival({
            ...base,
            ...changes,
          }),
        {
          code,
          statusCode,
        }
      );

      assert.equal(calls.length, 0);
    }

    try {
      const service =
        require(servicePath);

      await t.test(
        "uses authenticated phone and preserves zero",
        async () => {
          reset();

          const result =
            await service.finalizeOfflineRevival({
              ...base,
              sessionId:
                SESSION.toUpperCase(),
              requestId:
                REQUEST.toUpperCase(),
              playerName: undefined,
              avatar: undefined,
              userId: "forged-user",
              gameKey: "chess",
              scoreId: 999,
              creditCost: 0,
            });

          assert.strictEqual(
            result,
            response
          );

          assert.deepEqual(calls, [
            {
              userId: "0912345678",
              sessionId: SESSION,
              requestId: REQUEST,
              expectedEventSeq: 1,
              finalScore: 0,
              finalBestCombo: 0,
              playerName: "Cing iu",
              avatar: "",
            },
          ]);
        }
      );

      await t.test(
        "normalizes optional display fields",
        async () => {
          reset();

          await service.finalizeOfflineRevival({
            ...base,
            finalScore: 500,
            finalBestCombo: 12,
            playerName: "  Tower Player  ",
            avatar:
              "https://example.test/avatar.png",
          });

          assert.deepEqual(calls, [
            {
              userId: "0912345678",
              sessionId: SESSION,
              requestId: REQUEST,
              expectedEventSeq: 1,
              finalScore: 500,
              finalBestCombo: 12,
              playerName: "Tower Player",
              avatar:
                "https://example.test/avatar.png",
            },
          ]);
        }
      );

      await t.test(
        "rejects missing authenticated phone",
        async () => {
          await rejectBeforeRpc(
            {
              customer: {
                id: "forged-customer",
              },
            },
            "REVIVAL_MEMBER_IDENTITY_REQUIRED",
            401
          );
        }
      );

      await t.test(
        "rejects invalid session and request UUID",
        async () => {
          await rejectBeforeRpc(
            {
              sessionId: "invalid",
            },
            "REVIVAL_INVALID_UUID"
          );

          await rejectBeforeRpc(
            {
              requestId: "invalid",
            },
            "REVIVAL_INVALID_UUID"
          );
        }
      );

      await t.test(
        "rejects invalid event sequences",
        async () => {
          for (const seq of [
            0,
            -1,
            1.5,
            "1",
            2147483647,
          ]) {
            await rejectBeforeRpc(
              {
                expectedEventSeq: seq,
              },
              "REVIVAL_INVALID_EVENT_SEQUENCE"
            );
          }
        }
      );

      await t.test(
        "rejects invalid score and combo",
        async () => {
          const invalid = [
            -1,
            1.5,
            "10",
            null,
            undefined,
            1000001,
            NaN,
            Infinity,
          ];

          for (const value of invalid) {
            await rejectBeforeRpc(
              {
                finalScore: value,
              },
              "REVIVAL_INVALID_FINAL_RESULT"
            );

            await rejectBeforeRpc(
              {
                finalBestCombo: value,
              },
              "REVIVAL_INVALID_FINAL_RESULT"
            );
          }
        }
      );

      await t.test(
        "rejects invalid display fields",
        async () => {
          await rejectBeforeRpc(
            {
              playerName: 123,
            },
            "REVIVAL_INVALID_PLAYER_NAME"
          );

          await rejectBeforeRpc(
            {
              playerName:
                "X".repeat(101),
            },
            "REVIVAL_INVALID_PLAYER_NAME"
          );

          await rejectBeforeRpc(
            {
              avatar: 123,
            },
            "REVIVAL_INVALID_AVATAR"
          );

          await rejectBeforeRpc(
            {
              avatar:
                "X".repeat(2049),
            },
            "REVIVAL_INVALID_AVATAR"
          );
        }
      );

      await t.test(
        "preserves PostgreSQL replay response",
        async () => {
          reset();

          response = {
            applied: false,
            score_id:
              "9223372036854775806",
            event_id:
              "9223372036854775807",
            final_score: 500,
            final_best_combo: 12,
          };

          const result =
            await service.finalizeOfflineRevival({
              ...base,
              finalScore: 500,
              finalBestCombo: 12,
            });

          assert.strictEqual(
            result,
            response
          );

          assert.equal(calls.length, 1);
        }
      );

      await t.test(
        "maps SQL business conflicts once",
        async () => {
          reset();

          failure = {
            code: "23505",
            message:
              "REVIVAL_FINALIZE_REQUEST_CONFLICT",
          };

          await assert.rejects(
            service.finalizeOfflineRevival(
              base
            ),
            {
              code:
                "REVIVAL_FINALIZE_REQUEST_CONFLICT",
              statusCode: 409,
            }
          );

          assert.equal(calls.length, 1);
        }
      );

      await t.test(
        "maps owner mismatch to HTTP 404",
        async () => {
          reset();

          failure = {
            code: "P0002",
            message:
              "REVIVAL_SESSION_NOT_FOUND",
          };

          await assert.rejects(
            service.finalizeOfflineRevival(
              base
            ),
            {
              code:
                "REVIVAL_SESSION_NOT_FOUND",
              statusCode: 404,
            }
          );

          assert.equal(calls.length, 1);
        }
      );

      await t.test(
        "sanitizes internal SQL consistency error",
        async () => {
          reset();

          failure = {
            code: "55000",
            message:
              "REVIVAL_FINALIZE_SCORE_INCONSISTENT",
          };

          await assert.rejects(
            service.finalizeOfflineRevival(
              base
            ),
            (error) => {
              assert.equal(
                error.code,
                "REVIVAL_FINALIZE_SCORE_INCONSISTENT"
              );

              assert.equal(
                error.statusCode,
                500
              );

              assert.doesNotMatch(
                error.message,
                /INCONSISTENT|database/i
              );

              return true;
            }
          );

          assert.equal(calls.length, 1);
        }
      );

      await t.test(
        "sanitizes unknown database errors",
        async () => {
          reset();

          failure = {
            code: "XX000",
            message:
              "private PostgreSQL details",
          };

          await assert.rejects(
            service.finalizeOfflineRevival(
              base
            ),
            (error) => {
              assert.equal(
                error.code,
                "REVIVAL_SERVICE_FAILED"
              );

              assert.equal(
                error.statusCode,
                500
              );

              assert.doesNotMatch(
                error.message,
                /private PostgreSQL details/
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

      restoreRepo();
    }
  }
);
