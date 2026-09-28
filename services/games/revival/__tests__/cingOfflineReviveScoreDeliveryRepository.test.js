"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(
  __dirname,
  "../../../.."
);

const FILE = path.join(
  ROOT,
  "services/games/revival/repositories/cingOfflineReviveScoreDeliveryRepository.js"
);

const TOKEN =
  "11111111-1111-4111-8111-111111111111";

const SCORE_ID =
  "9007199254740993";

function createRepository({
  rpcResults = [],
  score = null,
  analytics = null,
} = {}) {
  const calls = [];

  const resultQueue =
    [...rpcResults];

  const supabase = {
    async rpc(name, params) {
      calls.push({
        type: "rpc",
        name,
        params,
      });

      return resultQueue.shift() || {
        data: null,
        error: null,
      };
    },

    from(table) {
      const filters = [];

      const query = {
        select(value) {
          calls.push({
            type: "select",
            table,
            value,
          });

          return query;
        },

        eq(key, value) {
          filters.push({
            key,
            value,
          });

          return query;
        },

        async maybeSingle() {
          calls.push({
            type: "read",
            table,
            filters,
          });

          return {
            data:
              table === "game_scores"
                ? score
                : analytics,
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
    fs.readFileSync(FILE, "utf8"),
    {
      module,
      exports: module.exports,
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
    { filename: FILE }
  );

  return {
    repository: module.exports,
    calls,
  };
}

test(
  "claim preserves PostgreSQL bigint and worker token",
  async () => {
    const { repository, calls } =
      createRepository({
        rpcResults: [
          {
            data: [
              {
                score_id: SCORE_ID,
                worker_token: TOKEN,
                status: "processing",
                analytics_done: false,
              },
            ],
            error: null,
          },
        ],
      });

    const job =
      await repository.claim();

    assert.equal(
      job.score_id,
      SCORE_ID
    );

    assert.equal(
      job.worker_token,
      TOKEN
    );

    assert.equal(
      calls[0].name,
      "cing_offline_revive_score_claim_v1"
    );

    assert.equal(
      calls[0].params.p_lease_seconds,
      300
    );
  }
);

test(
  "empty claim returns no job",
  async () => {
    const { repository } =
      createRepository({
        rpcResults: [
          {
            data: [],
            error: null,
          },
        ],
      });

    assert.equal(
      await repository.claim(),
      null
    );
  }
);

test(
  "renew preserves exact token and bigint string",
  async () => {
    const { repository, calls } =
      createRepository({
        rpcResults: [
          {
            data: true,
            error: null,
          },
        ],
      });

    assert.equal(
      await repository.renew({
        scoreId: SCORE_ID,
        workerToken: TOKEN,
      }),
      true
    );

    assert.equal(
      calls[0].params.p_score_id,
      SCORE_ID
    );

    assert.equal(
      calls[0].params.p_worker_token,
      TOKEN
    );
  }
);

test(
  "analytics calls atomic RPC only",
  async () => {
    const { repository, calls } =
      createRepository({
        rpcResults: [
          {
            data: [
              {
                accepted: true,
                created: true,
              },
            ],
            error: null,
          },
        ],
      });

    const result =
      await repository.deliverAnalytics({
        scoreId: SCORE_ID,
        workerToken: TOKEN,
      });

    assert.equal(
      result.accepted,
      true
    );

    assert.equal(
      result.created,
      true
    );

    assert.equal(
      calls.length,
      1
    );

    assert.equal(
      calls[0].name,
      "cing_offline_revive_score_analytics_v1"
    );
  }
);

test(
  "generic ACK cannot ACK analytics",
  async () => {
    const { repository, calls } =
      createRepository();

    await assert.rejects(
      repository.ackStage({
        scoreId: SCORE_ID,
        workerToken: TOKEN,
        stage: "analytics",
      }),
      /REVIVAL_DELIVERY_STAGE_INVALID/
    );

    assert.equal(
      calls.length,
      0
    );
  }
);

test(
  "leaderboard ACK uses exact RPC stage",
  async () => {
    const { repository, calls } =
      createRepository({
        rpcResults: [
          {
            data: [
              {
                accepted: true,
                completed: false,
                analytics_done: true,
                leaderboard_done: true,
                top1_done: false,
              },
            ],
            error: null,
          },
        ],
      });

    const result =
      await repository.ackStage({
        scoreId: SCORE_ID,
        workerToken: TOKEN,
        stage: "leaderboard",
      });

    assert.equal(
      result.accepted,
      true
    );

    assert.equal(
      result.completed,
      false
    );

    assert.equal(
      calls[0].params.p_stage,
      "leaderboard"
    );
  }
);

test(
  "Top1 ACK may complete delivery",
  async () => {
    const { repository } =
      createRepository({
        rpcResults: [
          {
            data: [
              {
                accepted: true,
                completed: true,
                analytics_done: true,
                leaderboard_done: true,
                top1_done: true,
              },
            ],
            error: null,
          },
        ],
      });

    const result =
      await repository.ackStage({
        scoreId: SCORE_ID,
        workerToken: TOKEN,
        stage: "top1",
      });

    assert.equal(
      result.completed,
      true
    );

    assert.equal(
      result.top1_done,
      true
    );
  }
);

test(
  "fail passes bounded reason once",
  async () => {
    const { repository, calls } =
      createRepository({
        rpcResults: [
          {
            data: true,
            error: null,
          },
        ],
      });

    assert.equal(
      await repository.fail({
        scoreId: SCORE_ID,
        workerToken: TOKEN,
        error: new Error(
          "realtime_unavailable"
        ),
      }),
      true
    );

    assert.equal(
      calls.length,
      1
    );

    assert.equal(
      calls[0].params.p_error,
      "realtime_unavailable"
    );
  }
);

test(
  "unsafe numeric bigint is rejected before RPC",
  async () => {
    const { repository, calls } =
      createRepository();

    await assert.rejects(
      repository.renew({
        scoreId:
          Number.MAX_SAFE_INTEGER + 2,
        workerToken: TOKEN,
      }),
      /REVIVAL_DELIVERY_SCORE_ID_UNSAFE/
    );

    assert.equal(
      calls.length,
      0
    );
  }
);

test(
  "RPC error propagates without mutation retry",
  async () => {
    const failure =
      new Error("database unavailable");

    const { repository, calls } =
      createRepository({
        rpcResults: [
          {
            data: null,
            error: failure,
          },
        ],
      });

    await assert.rejects(
      repository.deliverAnalytics({
        scoreId: SCORE_ID,
        workerToken: TOKEN,
      }),
      /database unavailable/
    );

    assert.equal(
      calls.length,
      1
    );
  }
);

test(
  "score read is bound to exact finalized identity",
  async () => {
    const { repository, calls } =
      createRepository({
        score: {
          id: SCORE_ID,
          offline_revive_session_id:
            "22222222-2222-4222-8222-222222222222",
          game_key:
            "cing-stack-tower",
          user_id: "member-1",
          score: 500,
        },
      });

    const score =
      await repository.getScore({
        scoreId: SCORE_ID,
        sessionId:
          "22222222-2222-4222-8222-222222222222",
        gameKey:
          "cing-stack-tower",
        userId: "member-1",
      });

    assert.equal(
      score.id,
      SCORE_ID
    );

    const read =
      calls.find(
        call => call.type === "read"
      );

    assert.equal(
      read.table,
      "game_scores"
    );

    assert.equal(
      read.filters.length,
      4
    );
  }
);

test(
  "analytics read uses score identity",
  async () => {
    const { repository, calls } =
      createRepository({
        analytics: {
          event_name:
            "game_score",
          user_id:
            "member-1",
          event_data: {
            offline_revive_score_id:
              SCORE_ID,
            previous_weekly_best:
              200,
          },
        },
      });

    const result =
      await repository.getAnalyticsEvent({
        scoreId: SCORE_ID,
        userId: "member-1",
      });

    assert.equal(
      result.event_data
        .previous_weekly_best,
      200
    );

    const read =
      calls.find(
        call => call.type === "read"
      );

    assert.ok(
      read.filters.some(
        item =>
          item.key ===
            "event_data->>offline_revive_score_id" &&
          item.value === SCORE_ID
      )
    );
  }
);
