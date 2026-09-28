"use strict";

/*
 * CING GAME CENTER V2 — REWARD PROCESSOR
 *
 * No scheduler starts on import.
 * No balance or ledger mutation in Node.
 * PostgreSQL owns credit and notification intent.
 */

const GAME_KEYS = new Set([
  "black-pearl-rush",
  "cing-stack-tower",
]);

const LEASE_SECONDS = 300;

const SKIPPABLE_ERRORS = new Set([
  "REVIVAL_REWARD_SNAPSHOT_INELIGIBLE",
  "REVIVAL_REWARD_TARGET_NOT_REACHED",
]);

function validScoreId(value) {
  return (
    typeof value === "string" &&
    /^[1-9][0-9]*$/.test(value)
  ) || (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function assertJob(job) {
  if (
    !job ||
    !validScoreId(job.score_id) ||
    typeof job.session_id !== "string" ||
    typeof job.user_id !== "string" ||
    typeof job.reward_worker_token !== "string" ||
    !GAME_KEYS.has(job.game_key) ||
    job.reward_status !== "processing" ||
    typeof job.reward_applied !== "boolean" &&
      job.reward_applied !== null
  ) {
    throw new Error(
      "REVIVAL_REWARD_DELIVERY_JOB_INVALID"
    );
  }

  return job;
}

function classifySkippable(error) {
  const message = String(error?.message || "");
  return SKIPPABLE_ERRORS.has(message)
    ? message
    : null;
}

function createRewardDeliveryProcessor({
  repository,
}) {
  if (
    !repository ||
    typeof repository.claim !== "function" ||
    typeof repository.renew !== "function" ||
    typeof repository.award !== "function" ||
    typeof repository.ack !== "function" ||
    typeof repository.fail !== "function"
  ) {
    throw new Error(
      "REVIVAL_REWARD_DELIVERY_DEPENDENCY_INVALID"
    );
  }

  async function processOne() {
    const job = await repository.claim({
      leaseSeconds: LEASE_SECONDS,
    });

    if (!job) {
      return {
        processed: false,
        reason: "empty",
      };
    }

    const identity = {
      scoreId: job.score_id,
      workerToken: job.reward_worker_token,
    };

    async function renewOrThrow() {
      if (
        await repository.renew({
          ...identity,
          leaseSeconds: LEASE_SECONDS,
        }) !== true
      ) {
        throw new Error(
          "REVIVAL_REWARD_DELIVERY_LEASE_LOST"
        );
      }
    }

    async function ackOrThrow(
      outcome,
      reason = null
    ) {
      await renewOrThrow();

      const result = await repository.ack({
        ...identity,
        outcome,
        reason,
      });

      if (
        result?.accepted !== true ||
        result?.outcome !== outcome
      ) {
        throw new Error(
          "REVIVAL_REWARD_DELIVERY_ACK_INVALID"
        );
      }

      return result;
    }

    try {
      assertJob(job);
      await renewOrThrow();

      /*
       * Recovery after PostgreSQL committed
       * credit but Node lost its ACK response.
       */
      if (job.reward_applied === true) {
        if (
          !job.reward_challenge_id ||
          !job.reward_snapshot_id ||
          job.reward_notification_status !==
            "pending"
        ) {
          throw new Error(
            "REVIVAL_REWARD_RECOVERY_INCONSISTENT"
          );
        }

        await ackOrThrow("completed");

        return {
          processed: true,
          delivered: true,
          awarded: true,
          recovered: true,
          score_id: job.score_id,
        };
      }

      await renewOrThrow();

      let result;

      try {
        result = await repository.award({
          sessionId: job.session_id,
          userId: job.user_id,
          workerToken:
            job.reward_worker_token,
        });

      } catch (error) {
        const reason =
          classifySkippable(error);

        if (!reason) {
          throw error;
        }

        await ackOrThrow(
          "skipped",
          reason
        );

        return {
          processed: true,
          delivered: true,
          awarded: false,
          reason,
          score_id: job.score_id,
        };
      }

      if (result.applied === true) {
        if (
          result.winner_user_id !==
            job.user_id ||
          result.winner_session_id !==
            job.session_id ||
          !result.challenge_id ||
          !result.snapshot_id
        ) {
          throw new Error(
            "REVIVAL_REWARD_AWARD_IDENTITY_INVALID"
          );
        }

        await ackOrThrow("completed");

        return {
          processed: true,
          delivered: true,
          awarded: true,
          recovered: false,
          score_id: job.score_id,
        };
      }

      if (result.applied === false) {
        if (
          typeof result.winner_session_id !==
            "string" ||
          !result.winner_session_id ||
          typeof result.winner_user_id !==
            "string" ||
          !result.winner_user_id
        ) {
          throw new Error(
            "REVIVAL_REWARD_WINNER_PROVENANCE_MISSING"
          );
        }

        if (
          result.winner_session_id ===
            job.session_id
        ) {
          throw new Error(
            "REVIVAL_REWARD_OWN_SESSION_STATE_INCONSISTENT"
          );
        }

        await ackOrThrow(
          "skipped",
          "OTHER_SESSION_WON"
        );

        return {
          processed: true,
          delivered: true,
          awarded: false,
          reason: "OTHER_SESSION_WON",
          score_id: job.score_id,
        };
      }

      throw new Error(
        "REVIVAL_REWARD_RESULT_INVALID"
      );

    } catch (error) {
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
          score_id: job.score_id,
          failure_recorded: false,
          error: String(
            error?.message || error
          ),
          fail_error: String(
            failError?.message ||
              failError
          ),
        };
      }

      return {
        processed: true,
        delivered: false,
        score_id: job.score_id,
        failure_recorded:
          failureRecorded,
        error: String(
          error?.message || error
        ),
      };
    }
  }

  return {
    processOne,
  };
}

function createProductionProcessor() {
  const repository = require(
    "../repositories/cingOfflineReviveRewardDeliveryRepository"
  );

  return createRewardDeliveryProcessor({
    repository,
  });
}

module.exports = {
  createRewardDeliveryProcessor,
  createProductionProcessor,
};
