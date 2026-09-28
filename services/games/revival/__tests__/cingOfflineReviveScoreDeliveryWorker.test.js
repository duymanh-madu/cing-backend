"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createScoreDeliveryProcessor,
} = require(
  "../workers/cingOfflineReviveScoreDeliveryWorker"
);

const TOKEN =
  "11111111-1111-4111-8111-111111111111";

const SCORE_ID =
  "9007199254740993";

const SESSION_ID =
  "22222222-2222-4222-8222-222222222222";

function fixture(options = {}) {
  const calls = [];

  const job = {
    score_id: SCORE_ID,
    worker_token: TOKEN,
    session_id: SESSION_ID,
    user_id: "member-1",
    game_key: "cing-stack-tower",
    status: "processing",
    analytics_done: false,
    leaderboard_done: false,
    top1_done: false,
    ...options.job,
  };

  const score = {
    id: SCORE_ID,
    offline_revive_session_id:
      SESSION_ID,
    user_id: "member-1",
    game_key: "cing-stack-tower",
    player_name: "Cing iu",
    avatar: "",
    score: 500,
    ...options.score,
  };

  const event = {
    user_id: "member-1",
    event_name: "game_score",
    event_data: {
      offline_revive_score_id:
        SCORE_ID,
      game_key: "cing-stack-tower",
      score: 500,
      previous_weekly_best:
        300,
      previous_alltime_best:
        700,
      ...options.eventData,
    },
  };

  const repository = {
    async claim(args) {
      calls.push([
        "claim",
        args,
      ]);

      if (options.claimError) {
        throw options.claimError;
      }

      return options.empty
        ? null
        : job;
    },

    async renew(args) {
      calls.push([
        "renew",
        args,
      ]);

      return !options.leaseLost;
    },

    async deliverAnalytics(args) {
      calls.push([
        "analytics",
        args,
      ]);

      if (options.analyticsError) {
        throw options.analyticsError;
      }

      return {
        accepted:
          !options.analyticsRejected,
        created: true,
      };
    },

    async getScore(args) {
      calls.push([
        "score",
        args,
      ]);

      return score;
    },

    async getAnalyticsEvent(args) {
      calls.push([
        "event",
        args,
      ]);

      return event;
    },

    async ackStage(args) {
      calls.push([
        "ack",
        args.stage,
      ]);

      if (
        options.ackRejected ===
        args.stage
      ) {
        return {
          accepted: false,
        };
      }

      return {
        accepted: true,
        completed:
          args.stage === "top1",
        analytics_done: true,
        leaderboard_done: true,
        top1_done:
          args.stage === "top1",
      };
    },

    async fail(args) {
      calls.push([
        "fail",
        args.error.message,
      ]);

      if (options.failError) {
        throw options.failError;
      }

      return true;
    },
  };

  const processor =
    createScoreDeliveryProcessor({
      repository,

      async getGameLeaderboard(
        gameKey,
        args
      ) {
        calls.push([
          "leaderboard",
          gameKey,
          args,
        ]);

        if (options.leaderboardError) {
          throw options.leaderboardError;
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
        args
      ) {
        calls.push([
          "emit",
          args,
        ]);

        return !options.emitFailed;
      },

      async checkAndNotifyTop1Changes(
        io,
        args
      ) {
        calls.push([
          "top1",
          args,
        ]);

        if (options.top1Error) {
          throw options.top1Error;
        }

        return options.top1Unverified
          ? undefined
          : {
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
  };
}

function names(calls) {
  return calls.map(item => item[0]);
}

test(
  "empty queue does not run side effects",
  async () => {
    const { processor, calls } =
      fixture({
        empty: true,
      });

    assert.deepEqual(
      await processor.processOne(),
      {
        processed: false,
        reason: "empty",
      }
    );

    assert.deepEqual(
      names(calls),
      ["claim"]
    );
  }
);

test(
  "claim errors propagate without fake fail",
  async () => {
    const { processor, calls } =
      fixture({
        claimError:
          new Error(
            "claim unavailable"
          ),
      });

    await assert.rejects(
      processor.processOne(),
      /claim unavailable/
    );

    assert.deepEqual(
      names(calls),
      ["claim"]
    );
  }
);

test(
  "full delivery follows durable stage order",
  async () => {
    const { processor, calls } =
      fixture();

    const result =
      await processor.processOne();

    assert.equal(
      result.delivered,
      true
    );

    assert.equal(
      result.score_id,
      SCORE_ID
    );

    assert.equal(
      result.highscore_changed,
      true
    );

    assert.deepEqual(
      calls
        .filter(item =>
          [
            "analytics",
            "emit",
            "top1",
            "ack",
          ].includes(item[0])
        )
        .map(item =>
          item[0] === "ack"
            ? `ack:${item[1]}`
            : item[0]
        ),
      [
        "analytics",
        "emit",
        "ack:leaderboard",
        "top1",
        "ack:top1",
      ]
    );

    const emit =
      calls.find(
        item => item[0] === "emit"
      )[1];

    assert.equal(
      emit.previous_best,
      300
    );

    assert.equal(
      emit.game_key,
      "cing-stack-tower"
    );

    assert.equal(
      emit.score,
      500
    );

    assert.equal(
      emit.scope,
      "weekly"
    );

    assert.equal(
      calls.find(
        item => item[0] === "top1"
      )[1].strictDelivery,
      true
    );

    assert.equal(
      calls.some(
        item =>
          item[0] === "ack" &&
          item[1] === "analytics"
      ),
      false
    );
  }
);

test(
  "non-highscore completes without broadcasts",
  async () => {
    const { processor, calls } =
      fixture({
        eventData: {
          previous_weekly_best:
            600,
          previous_alltime_best:
            700,
        },
      });

    const result =
      await processor.processOne();

    assert.equal(
      result.delivered,
      true
    );

    assert.equal(
      result.highscore_changed,
      false
    );

    assert.equal(
      names(calls).includes("emit"),
      false
    );

    assert.equal(
      names(calls).includes("top1"),
      false
    );

    assert.deepEqual(
      calls
        .filter(item =>
          item[0] === "ack"
        )
        .map(item => item[1]),
      [
        "leaderboard",
        "top1",
      ]
    );
  }
);

test(
  "resume after analytics does not insert again",
  async () => {
    const { processor, calls } =
      fixture({
        job: {
          analytics_done: true,
        },
      });

    const result =
      await processor.processOne();

    assert.equal(
      result.delivered,
      true
    );

    assert.equal(
      names(calls).includes(
        "analytics"
      ),
      false
    );

    assert.equal(
      names(calls).includes(
        "event"
      ),
      true
    );
  }
);

test(
  "resume after leaderboard skips emit",
  async () => {
    const { processor, calls } =
      fixture({
        job: {
          analytics_done: true,
          leaderboard_done: true,
        },
      });

    const result =
      await processor.processOne();

    assert.equal(
      result.delivered,
      true
    );

    assert.equal(
      names(calls).includes(
        "emit"
      ),
      false
    );

    assert.equal(
      names(calls).includes(
        "top1"
      ),
      true
    );

    assert.deepEqual(
      calls
        .filter(item =>
          item[0] === "ack"
        )
        .map(item => item[1]),
      ["top1"]
    );
  }
);

test(
  "analytics rejection prevents all later effects",
  async () => {
    const { processor, calls } =
      fixture({
        analyticsRejected: true,
      });

    const result =
      await processor.processOne();

    assert.equal(
      result.delivered,
      false
    );

    assert.equal(
      names(calls).includes(
        "emit"
      ),
      false
    );

    assert.equal(
      names(calls).includes(
        "top1"
      ),
      false
    );

    assert.equal(
      names(calls).includes(
        "fail"
      ),
      true
    );
  }
);

test(
  "realtime false prevents leaderboard ACK",
  async () => {
    const { processor, calls } =
      fixture({
        emitFailed: true,
      });

    const result =
      await processor.processOne();

    assert.equal(
      result.delivered,
      false
    );

    assert.equal(
      calls.some(item =>
        item[0] === "ack" &&
        item[1] ===
          "leaderboard"
      ),
      false
    );

    assert.equal(
      names(calls).includes(
        "top1"
      ),
      false
    );
  }
);

test(
  "Top1 unverified prevents final ACK",
  async () => {
    const { processor, calls } =
      fixture({
        top1Unverified: true,
      });

    const result =
      await processor.processOne();

    assert.equal(
      result.delivered,
      false
    );

    assert.equal(
      calls.some(item =>
        item[0] === "ack" &&
        item[1] === "top1"
      ),
      false
    );
  }
);

test(
  "Top1 exception prevents final ACK",
  async () => {
    const { processor, calls } =
      fixture({
        top1Error:
          new Error(
            "cache update failed"
          ),
      });

    const result =
      await processor.processOne();

    assert.equal(
      result.delivered,
      false
    );

    assert.equal(
      names(calls).includes(
        "fail"
      ),
      true
    );
  }
);

test(
  "lost lease prevents analytics mutation",
  async () => {
    const { processor, calls } =
      fixture({
        leaseLost: true,
      });

    const result =
      await processor.processOne();

    assert.equal(
      result.delivered,
      false
    );

    assert.equal(
      names(calls).includes(
        "analytics"
      ),
      false
    );

    assert.equal(
      names(calls).includes(
        "emit"
      ),
      false
    );
  }
);

test(
  "rejected ACK cannot progress to Top1",
  async () => {
    const { processor, calls } =
      fixture({
        ackRejected:
          "leaderboard",
      });

    const result =
      await processor.processOne();

    assert.equal(
      result.delivered,
      false
    );

    assert.equal(
      names(calls).includes(
        "top1"
      ),
      false
    );
  }
);

test(
  "invalid persisted score cannot emit",
  async () => {
    const { processor, calls } =
      fixture({
        score: {
          score: 1000001,
        },
      });

    const result =
      await processor.processOne();

    assert.equal(
      result.delivered,
      false
    );

    assert.equal(
      names(calls).includes(
        "emit"
      ),
      false
    );
  }
);

test(
  "analytics identity mismatch cannot emit",
  async () => {
    const { processor, calls } =
      fixture({
        eventData: {
          offline_revive_score_id:
            "9999999999999999",
        },
      });

    const result =
      await processor.processOne();

    assert.equal(
      result.delivered,
      false
    );

    assert.equal(
      names(calls).includes(
        "emit"
      ),
      false
    );
  }
);

test(
  "fail RPC exception is reported without retry",
  async () => {
    const { processor, calls } =
      fixture({
        emitFailed: true,
        failError:
          new Error(
            "database unavailable"
          ),
      });

    const result =
      await processor.processOne();

    assert.equal(
      result.delivered,
      false
    );

    assert.equal(
      result.failure_recorded,
      false
    );

    assert.match(
      result.fail_error,
      /database unavailable/
    );

    assert.equal(
      names(calls).filter(
        name => name === "fail"
      ).length,
      1
    );
  }
);
