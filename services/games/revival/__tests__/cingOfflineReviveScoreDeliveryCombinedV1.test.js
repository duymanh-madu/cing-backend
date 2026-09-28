"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const {
  createScoreDeliveryProcessor,
} = require(
  "../workers/cingOfflineReviveScoreDeliveryWorker"
);

const REPO_SOURCE = fs.readFileSync(
  path.resolve(
    __dirname,
    "../repositories/" +
    "cingOfflineReviveScoreDeliveryRepository.js"
  ),
  "utf8"
);

const SCORE_ID =
  "9007199254740993";

const SESSION_ID =
  "22222222-2222-4222-8222-222222222222";

const TOKENS = [
  "11111111-1111-4111-8111-111111111111",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];

function fixture(options = {}) {
  const calls = [];

  const job = {
    score_id: SCORE_ID,
    session_id: SESSION_ID,
    user_id: "member-1",
    game_key: "cing-stack-tower",
    status: "pending",
    attempt_count: 0,
    worker_token: null,

    analytics_done: false,
    leaderboard_done: false,
    top1_done: false,
  };

  const score = {
    id: SCORE_ID,
    offline_revive_session_id:
      SESSION_ID,

    game_key: "cing-stack-tower",
    user_id: "member-1",
    player_name: "Cing iu",
    avatar: "",
    score: 500,
    played_at:
      "2026-09-23T00:00:00.000Z",
  };

  let event = null;

  let emitAttempts = 0;
  let top1Attempts = 0;

  function active(params) {
    return (
      job.status === "processing" &&
      job.score_id ===
        params.p_score_id &&
      job.worker_token ===
        params.p_worker_token
    );
  }

  const supabase = {
    async rpc(name, params) {
      calls.push({
        kind: "rpc",
        name,
        params,
      });

      switch (name) {
        case "cing_offline_revive_score_claim_v1": {
          if (
            options.empty ||
            job.status !== "pending"
          ) {
            return {
              data: [],
              error: null,
            };
          }

          job.attempt_count += 1;

          job.status =
            "processing";

          job.worker_token =
            TOKENS[
              job.attempt_count - 1
            ];

          assert.ok(
            job.worker_token,
            "fixture supports only three claims"
          );

          return {
            data: [{ ...job }],
            error: null,
          };
        }

        case "cing_offline_revive_score_renew_v1":
          return {
            data:
              active(params) &&
              !options.leaseLost,
            error: null,
          };

        case "cing_offline_revive_score_analytics_v1": {
          if (!active(params)) {
            return {
              data: [
                {
                  accepted: false,
                  created: false,
                },
              ],
              error: null,
            };
          }

          const created =
            !job.analytics_done;

          job.analytics_done = true;

          event ||= {
            user_id: "member-1",
            event_name:
              "game_score",

            event_data: {
              offline_revive_score_id:
                SCORE_ID,

              game_key:
                "cing-stack-tower",

              score: 500,

              previous_weekly_best:
                options.nonHighscore
                  ? 600
                  : 300,

              previous_alltime_best:
                700,
            },
          };

          return {
            data: [
              {
                accepted: true,
                created,
              },
            ],
            error: null,
          };
        }

        case "cing_offline_revive_score_ack_stage_v1": {
          if (!active(params)) {
            return {
              data: [
                {
                  accepted: false,
                  completed: false,
                  analytics_done: false,
                  leaderboard_done: false,
                  top1_done: false,
                },
              ],
              error: null,
            };
          }

          assert.notEqual(
            params.p_stage,
            "analytics"
          );

          assert.equal(
            job.analytics_done,
            true
          );

          if (
            params.p_stage ===
            "leaderboard"
          ) {
            job.leaderboard_done =
              true;
          } else {
            assert.equal(
              params.p_stage,
              "top1"
            );

            assert.equal(
              job.leaderboard_done,
              true
            );

            job.top1_done =
              true;
          }

          const completed =
            job.analytics_done &&
            job.leaderboard_done &&
            job.top1_done;

          if (completed) {
            job.status =
              "delivered";

            job.worker_token =
              null;
          }

          return {
            data: [
              {
                accepted: true,
                completed,
                analytics_done:
                  job.analytics_done,
                leaderboard_done:
                  job.leaderboard_done,
                top1_done:
                  job.top1_done,
              },
            ],
            error: null,
          };
        }

        case "cing_offline_revive_score_fail_v1": {
          const accepted =
            active(params);

          if (accepted) {
            job.status =
              "pending";

            job.worker_token =
              null;
          }

          return {
            data: accepted,
            error: null,
          };
        }

        default:
          throw new Error(
            `Unexpected RPC: ${name}`
          );
      }
    },

    from(table) {
      const filters = [];

      const query = {
        select() {
          return query;
        },

        eq(key, value) {
          filters.push([
            key,
            value,
          ]);

          return query;
        },

        async maybeSingle() {
          calls.push({
            kind: "read",
            table,
            filters,
          });

          const data =
            table ===
              "game_scores"
              ? score
              : table ===
                "analytics_events"
                ? event
                : null;

          if (
            ![
              "game_scores",
              "analytics_events",
            ].includes(table)
          ) {
            throw new Error(
              `Unexpected read: ${table}`
            );
          }

          const matches =
            filters.every(
              ([key, value]) => {
                if (
                  key ===
                  "event_data->>offline_revive_score_id"
                ) {
                  return (
                    String(
                      data?.event_data
                        ?.offline_revive_score_id
                    ) ===
                    String(value)
                  );
                }

                return (
                  String(
                    data?.[key]
                  ) ===
                  String(value)
                );
              }
            );

          return {
            data:
              data && matches
                ? data
                : null,
            error: null,
          };
        },
      };

      return query;
    },
  };

  const module = {
    exports: {},
  };

  vm.runInNewContext(
    REPO_SOURCE,
    {
      module,
      exports:
        module.exports,

      BigInt,
      Number,
      String,

      require(request) {
        assert.equal(
          request,
          "../../../../supabase"
        );

        return supabase;
      },
    },
    {
      filename:
        "cingOfflineReviveScoreDeliveryRepository.js",
    }
  );

  const repository =
    module.exports;

  const processor =
    createScoreDeliveryProcessor({
      repository,

      async getGameLeaderboard(
        gameKey,
        args
      ) {
        calls.push({
          kind: "leaderboard",
          gameKey,
          args,
        });

        assert.equal(
          gameKey,
          "cing-stack-tower"
        );

        assert.equal(
          args.weekly,
          true
        );

        assert.equal(
          args.strictPlayerRead,
          true
        );

        if (
          options.leaderboardError
        ) {
          throw new Error(
            "players query unavailable"
          );
        }

        return [
          {
            user_id:
              "member-1",
            score:
              500,
            rank:
              1,
          },
        ];
      },

      async emitLeaderboardUpdate(
        payload
      ) {
        emitAttempts += 1;

        calls.push({
          kind: "emit",
          payload,
        });

        return !(
          options.firstEmitFails &&
          emitAttempts === 1
        );
      },

      async checkAndNotifyTop1Changes(
        io,
        args
      ) {
        top1Attempts += 1;

        calls.push({
          kind: "top1",
          args,
        });

        assert.equal(
          args.strictDelivery,
          true
        );

        if (
          options.firstTop1Fails &&
          top1Attempts === 1
        ) {
          throw new Error(
            "Top1 cache update failed"
          );
        }

        return {
          verified: true,
          notifications_count:
            1,
          broadcasted:
            1,
        };
      },

      getIo() {
        return {};
      },
    });

  return {
    processor,
    calls,
    job,

    getEvent() {
      return event;
    },
  };
}

function rpcNames(calls) {
  return calls
    .filter(
      item =>
        item.kind === "rpc"
    )
    .map(
      item => item.name
    );
}

function effectNames(calls) {
  return calls
    .filter(
      item =>
        [
          "emit",
          "top1",
        ].includes(
          item.kind
        )
    )
    .map(
      item => item.kind
    );
}

test(
  "combined repository and worker deliver three stages",
  async () => {
    const f =
      fixture();

    const result =
      await f.processor.processOne();

    assert.equal(
      result.delivered,
      true
    );

    assert.equal(
      result.score_id,
      SCORE_ID
    );

    assert.equal(
      f.job.status,
      "delivered"
    );

    assert.equal(
      f.job.attempt_count,
      1
    );

    assert.equal(
      f.job.analytics_done,
      true
    );

    assert.equal(
      f.job.leaderboard_done,
      true
    );

    assert.equal(
      f.job.top1_done,
      true
    );

    assert.deepEqual(
      effectNames(f.calls),
      [
        "emit",
        "top1",
      ]
    );

    const names =
      rpcNames(f.calls);

    assert.equal(
      names.filter(
        name =>
          name ===
          "cing_offline_revive_score_analytics_v1"
      ).length,
      1
    );

    assert.equal(
      names.filter(
        name =>
          name ===
          "cing_offline_revive_score_ack_stage_v1"
      ).length,
      2
    );

    assert.equal(
      f.getEvent()
        .event_data
        .offline_revive_score_id,
      SCORE_ID
    );
  }
);

test(
  "combined non-highscore completes without realtime",
  async () => {
    const f =
      fixture({
        nonHighscore: true,
      });

    const result =
      await f.processor.processOne();

    assert.equal(
      result.delivered,
      true
    );

    assert.equal(
      result.highscore_changed,
      false
    );

    assert.deepEqual(
      effectNames(f.calls),
      []
    );

    assert.equal(
      f.job.status,
      "delivered"
    );
  }
);

test(
  "combined realtime failure retries without analytics duplication",
  async () => {
    const f =
      fixture({
        firstEmitFails: true,
      });

    const first =
      await f.processor.processOne();

    assert.equal(
      first.delivered,
      false
    );

    assert.equal(
      first.failure_recorded,
      true
    );

    assert.equal(
      f.job.status,
      "pending"
    );

    assert.equal(
      f.job.analytics_done,
      true
    );

    assert.equal(
      f.job.leaderboard_done,
      false
    );

    const second =
      await f.processor.processOne();

    assert.equal(
      second.delivered,
      true
    );

    assert.equal(
      f.job.attempt_count,
      2
    );

    const names =
      rpcNames(f.calls);

    assert.equal(
      names.filter(
        name =>
          name ===
          "cing_offline_revive_score_analytics_v1"
      ).length,
      1
    );

    assert.deepEqual(
      effectNames(f.calls),
      [
        "emit",
        "emit",
        "top1",
      ]
    );

    assert.equal(
      f.job.status,
      "delivered"
    );
  }
);

test(
  "combined Top1 failure resumes after leaderboard ACK",
  async () => {
    const f =
      fixture({
        firstTop1Fails: true,
      });

    const first =
      await f.processor.processOne();

    assert.equal(
      first.delivered,
      false
    );

    assert.equal(
      f.job.analytics_done,
      true
    );

    assert.equal(
      f.job.leaderboard_done,
      true
    );

    assert.equal(
      f.job.top1_done,
      false
    );

    const second =
      await f.processor.processOne();

    assert.equal(
      second.delivered,
      true
    );

    assert.deepEqual(
      effectNames(f.calls),
      [
        "emit",
        "top1",
        "top1",
      ]
    );

    assert.equal(
      f.job.status,
      "delivered"
    );
  }
);

test(
  "combined strict leaderboard failure prevents realtime ACK",
  async () => {
    const f =
      fixture({
        leaderboardError: true,
      });

    const result =
      await f.processor.processOne();

    assert.equal(
      result.delivered,
      false
    );

    assert.equal(
      result.failure_recorded,
      true
    );

    assert.equal(
      f.job.analytics_done,
      true
    );

    assert.equal(
      f.job.leaderboard_done,
      false
    );

    assert.deepEqual(
      effectNames(f.calls),
      []
    );

    assert.equal(
      f.job.status,
      "pending"
    );
  }
);

test(
  "combined empty claim has no side effects",
  async () => {
    const f =
      fixture({
        empty: true,
      });

    const result =
      await f.processor.processOne();

    assert.equal(
      result.processed,
      false
    );

    assert.equal(
      f.calls.length,
      1
    );

    assert.deepEqual(
      effectNames(f.calls),
      []
    );
  }
);
