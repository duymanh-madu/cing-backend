"use strict";

/*
 * CING GAME CENTER V2
 *
 * Durable score-side-effect orchestration.
 *
 * This module does NOT:
 * - start a scheduler
 * - start on import
 * - write game_scores
 * - call legacy saveGameScore
 * - change Wallet, points or plays
 *
 * PostgreSQL owns:
 * - the score
 * - the outbox
 * - claim/lease fencing
 * - analytics insert + analytics ACK
 * - ordered stage ACK
 * - retry and terminal failure
 */

const GAME_KEYS = new Set([
  "cing-stack-tower",
  "black-pearl-rush",
]);

const LEASE_SECONDS = 300;

function requireJob(job) {
  if (
    !job ||
    typeof job.score_id !== "string" ||
    !/^[1-9][0-9]*$/.test(job.score_id) ||
    typeof job.worker_token !== "string" ||
    typeof job.session_id !== "string" ||
    typeof job.user_id !== "string" ||
    !GAME_KEYS.has(job.game_key) ||
    job.status !== "processing"
  ) {
    throw new Error(
      "REVIVAL_SCORE_DELIVERY_JOB_INVALID"
    );
  }

  for (const key of [
    "analytics_done",
    "leaderboard_done",
    "top1_done",
  ]) {
    if (typeof job[key] !== "boolean") {
      throw new Error(
        "REVIVAL_SCORE_DELIVERY_STAGE_INVALID"
      );
    }
  }

  if (
    job.top1_done &&
    !job.leaderboard_done
  ) {
    throw new Error(
      "REVIVAL_SCORE_DELIVERY_STAGE_ORDER_INVALID"
    );
  }

  if (
    job.leaderboard_done &&
    !job.analytics_done
  ) {
    throw new Error(
      "REVIVAL_SCORE_DELIVERY_STAGE_ORDER_INVALID"
    );
  }

  return job;
}

function requireScore(score, job) {
  if (
    !score ||
    String(score.id) !== job.score_id ||
    score.offline_revive_session_id !==
      job.session_id ||
    score.game_key !== job.game_key ||
    score.user_id !== job.user_id ||
    !Number.isSafeInteger(score.score) ||
    score.score < 0 ||
    score.score > 1000000
  ) {
    throw new Error(
      "REVIVAL_SCORE_DELIVERY_SCORE_INVALID"
    );
  }

  return score;
}

function requireAnalytics(event, job, score) {
  const data = event?.event_data;

  if (
    !event ||
    event.user_id !== job.user_id ||
    event.event_name !== "game_score" ||
    !data ||
    String(
      data.offline_revive_score_id
    ) !== job.score_id ||
    data.game_key !== job.game_key ||
    Number(data.score) !== score.score
  ) {
    throw new Error(
      "REVIVAL_SCORE_DELIVERY_ANALYTICS_INVALID"
    );
  }

  for (const key of [
    "previous_weekly_best",
    "previous_alltime_best",
  ]) {
    if (
      !Number.isSafeInteger(
        Number(data[key])
      ) ||
      Number(data[key]) < 0
    ) {
      throw new Error(
        "REVIVAL_SCORE_DELIVERY_BEST_INVALID"
      );
    }
  }

  return {
    weekly:
      score.score >
      Number(data.previous_weekly_best),

    alltime:
      score.score >
      Number(data.previous_alltime_best),

    previousWeeklyBest:
      Number(data.previous_weekly_best),
  };
}

function requireAck(result, stage) {
  if (
    !result ||
    result.accepted !== true ||
    result.analytics_done !== true
  ) {
    throw new Error(
      `REVIVAL_SCORE_DELIVERY_${stage}_ACK_REJECTED`
    );
  }

  if (
    stage === "leaderboard" &&
    result.leaderboard_done !== true
  ) {
    throw new Error(
      "REVIVAL_SCORE_DELIVERY_LEADERBOARD_ACK_INVALID"
    );
  }

  if (
    stage === "top1" &&
    (
      result.completed !== true ||
      result.top1_done !== true ||
      result.leaderboard_done !== true
    )
  ) {
    throw new Error(
      "REVIVAL_SCORE_DELIVERY_TOP1_ACK_INVALID"
    );
  }

  return result;
}

/*
 * Dependency injection is intentional:
 * tests exercise the actual orchestrator
 * without connecting to production.
 */

function createScoreDeliveryProcessor({
  repository,
  getGameLeaderboard,
  emitLeaderboardUpdate,
  checkAndNotifyTop1Changes,
  getIo,
}) {
  if (
    !repository ||
    typeof repository.claim !== "function" ||
    typeof repository.renew !== "function" ||
    typeof repository.deliverAnalytics !==
      "function" ||
    typeof repository.ackStage !== "function" ||
    typeof repository.fail !== "function" ||
    typeof repository.getScore !== "function" ||
    typeof repository.getAnalyticsEvent !==
      "function" ||
    typeof getGameLeaderboard !== "function" ||
    typeof emitLeaderboardUpdate !==
      "function" ||
    typeof checkAndNotifyTop1Changes !==
      "function" ||
    typeof getIo !== "function"
  ) {
    throw new Error(
      "REVIVAL_SCORE_DELIVERY_DEPENDENCY_INVALID"
    );
  }

  async function processOne() {
    /*
     * Failed claim means no lease exists.
     * Propagate rather than calling fail()
     * with invented identity.
     */

    const claimed =
      await repository.claim({
        leaseSeconds: LEASE_SECONDS,
      });

    if (!claimed) {
      return {
        processed: false,
        reason: "empty",
      };
    }

    const job = claimed;

    const identity = {
      scoreId: job.score_id,
      workerToken: job.worker_token,
    };

    async function renewOrThrow() {
      const renewed =
        await repository.renew({
          ...identity,
          leaseSeconds: LEASE_SECONDS,
        });

      if (renewed !== true) {
        throw new Error(
          "REVIVAL_SCORE_DELIVERY_LEASE_LOST"
        );
      }
    }

    async function ackOrThrow(stage) {
      /*
       * A network emission and its ACK
       * cannot be one transaction.
       *
       * If lease ownership is lost here,
       * never ACK under a stale token.
       */

      await renewOrThrow();

      const result =
        await repository.ackStage({
          ...identity,
          stage,
        });

      return requireAck(
        result,
        stage
      );
    }

    try {
      requireJob(job);

      await renewOrThrow();

      const score = requireScore(
        await repository.getScore({
          scoreId: job.score_id,
          sessionId: job.session_id,
          gameKey: job.game_key,
          userId: job.user_id,
        }),
        job
      );

      /*
       * Stage 1: analytics.
       *
       * Its SQL RPC atomically inserts
       * the event and sets analytics_done.
       */

      if (!job.analytics_done) {
        await renewOrThrow();

        const analyticsResult =
          await repository.deliverAnalytics(
            identity
          );

        if (
          !analyticsResult ||
          analyticsResult.accepted !== true
        ) {
          throw new Error(
            "REVIVAL_SCORE_DELIVERY_ANALYTICS_REJECTED"
          );
        }
      }

      /*
       * Read database-authored historical
       * best values even when analytics
       * was completed by a prior worker.
       */

      await renewOrThrow();

      const analyticsEvent =
        await repository.getAnalyticsEvent({
          scoreId: job.score_id,
          userId: job.user_id,
        });

      const highscore =
        requireAnalytics(
          analyticsEvent,
          job,
          score
        );

      const highscoreChanged =
        highscore.weekly ||
        highscore.alltime;

      /*
       * Stage 2: leaderboard.
       *
       * Preserve legacy score behavior:
       * a non-highscore does not broadcast.
       */

      if (!job.leaderboard_done) {
        if (highscoreChanged) {
          await renewOrThrow();

          const leaderboard =
            await getGameLeaderboard(
              job.game_key,
              {
                weekly: true,
                limit: 100,
                strictPlayerRead: true,
              }
            );

          if (
            !Array.isArray(leaderboard)
          ) {
            throw new Error(
              "REVIVAL_SCORE_DELIVERY_LEADERBOARD_INVALID"
            );
          }

          /*
           * Refresh lease immediately
           * before external side effect.
           */

          await renewOrThrow();

          const sent =
            await emitLeaderboardUpdate({
              leaderboard,
              game_key:
                job.game_key,
              scope:
                "weekly",
              reason:
                "highscore_changed",
              updated_user: {
                user_id:
                  job.user_id,
                player_name:
                  score.player_name || "",
                avatar:
                  score.avatar || "",
              },
              previous_best:
                highscore.previousWeeklyBest,
              score:
                score.score,
              highscore_changed:
                true,
            });

          if (sent !== true) {
            throw new Error(
              "REVIVAL_SCORE_DELIVERY_REALTIME_FAILED"
            );
          }
        }

        await ackOrThrow(
          "leaderboard"
        );
      }

      /*
       * Stage 3: Top 1.
       *
       * Non-highscores preserve legacy
       * no-notification behavior.
       */

      if (!job.top1_done) {
        if (highscoreChanged) {
          await renewOrThrow();

          const verified =
            await checkAndNotifyTop1Changes(
              getIo(),
              {
                strictDelivery: true,
              }
            );

          if (
            !verified ||
            verified.verified !== true ||
            !Number.isSafeInteger(
              verified.notifications_count
            ) ||
            !Number.isSafeInteger(
              verified.broadcasted
            ) ||
            verified.broadcasted !==
              verified.notifications_count
          ) {
            throw new Error(
              "REVIVAL_SCORE_DELIVERY_TOP1_UNVERIFIED"
            );
          }
        }

        const completed =
          await ackOrThrow(
            "top1"
          );

        return {
          processed: true,
          delivered: true,
          score_id:
            job.score_id,
          highscore_changed:
            highscoreChanged,
          completed:
            completed.completed,
        };
      }

      /*
       * The delivery RPC normally marks
       * status delivered on Top1 ACK.
       * A claimed job should therefore
       * never arrive with top1_done=true.
       */

      throw new Error(
        "REVIVAL_SCORE_DELIVERY_FINAL_STAGE_INCONSISTENT"
      );

    } catch (error) {
      /*
       * PostgreSQL checks lease ownership
       * before recording this failed attempt.
       *
       * A stale worker cannot overwrite
       * a newer worker's state.
       */

      let failureRecorded = false;

      try {
        failureRecorded =
          await repository.fail({
            ...identity,
            error,
          }) === true;

      } catch (failError) {
        return {
          processed: true,
          delivered: false,
          score_id:
            job.score_id,
          failure_recorded:
            false,
          error:
            String(error?.message || error),
          fail_error:
            String(
              failError?.message ||
              failError
            ),
        };
      }

      return {
        processed: true,
        delivered: false,
        score_id:
          job.score_id,
        failure_recorded:
          failureRecorded,
        error:
          String(error?.message || error),
      };
    }
  }

  return {
    processOne,
  };
}

/*
 * Runtime wiring is deliberately lazy.
 * Importing this file cannot start work.
 */

function createProductionProcessor() {
  const repository = require(
    "../repositories/cingOfflineReviveScoreDeliveryRepository"
  );

  const {
    getGameLeaderboard,
  } = require(
    "../../../leaderboardService"
  );

  const {
    emitLeaderboardUpdate,
  } = require(
    "../../../gamification/realtime/realtimeLeaderboardService"
  );

  const {
    checkAndNotifyTop1Changes,
  } = require(
    "../../../leaderboardResetService"
  );

  return createScoreDeliveryProcessor({
    repository,
    getGameLeaderboard,
    emitLeaderboardUpdate,
    checkAndNotifyTop1Changes,

    getIo() {
      return (
        global._ioInstance ||
        global.io ||
        null
      );
    },
  });
}

module.exports = {
  createScoreDeliveryProcessor,
  createProductionProcessor,
};
