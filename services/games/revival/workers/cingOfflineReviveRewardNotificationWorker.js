"use strict";

/*
 * Notification delivery is independent of
 * financial Reward Delivery.
 *
 * Importing this module starts no work.
 */

function validId(value) {
  return (
    typeof value === "string" &&
    /^[1-9][0-9]*$/.test(value)
  ) || (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function createNotificationProcessor({
  repository,
  publish,
}) {
  if (
    !repository ||
    ["claim", "create", "getNotification", "ack", "fail"]
      .some(name => typeof repository[name] !== "function") ||
    typeof publish !== "function"
  ) {
    throw Error("REVIVAL_NOTIFICATION_DEPENDENCY_INVALID");
  }

  async function processOne() {
    const job = await repository.claim({
      leaseSeconds: 300,
    });

    if (!job) {
      return { processed: false, reason: "empty" };
    }

    const identity = {
      scoreId: job.score_id,
      workerToken: job.reward_notification_worker_token,
    };

    try {
      if (
        !validId(job.score_id) ||
        !job.reward_notification_worker_token ||
        !job.user_id ||
        !job.session_id ||
        job.reward_status !== "completed" ||
        job.reward_applied !== true ||
        job.reward_notification_status !== "processing"
      ) {
        throw Error("REVIVAL_NOTIFICATION_JOB_INVALID");
      }

      const created = await repository.create(identity);

      if (
        !validId(created?.notification_id) ||
        typeof created.created !== "boolean"
      ) {
        throw Error("REVIVAL_NOTIFICATION_CREATE_INVALID");
      }

      const notification = await repository.getNotification({
        notificationId: created.notification_id,
      });

      if (
        !notification ||
        String(notification.id) !==
          String(created.notification_id) ||
        notification.user_id !== job.user_id ||
        notification.source_event !==
          "cing_offline_revive_daily_reward" ||
        notification.type !== "daily_challenge_reward" ||
        String(notification.metadata?.revival_session_id) !==
          String(job.session_id) ||
        String(notification.metadata?.revival_score_id) !==
          String(job.score_id) ||
        String(notification.metadata?.daily_challenge_id) !==
          String(job.reward_challenge_id) ||
        String(notification.metadata?.challenge_snapshot_id) !==
          String(job.reward_snapshot_id) ||
        !Number.isSafeInteger(
          notification.data?.reward_points
        ) ||
        notification.data.reward_points <= 0
      ) {
        throw Error("REVIVAL_NOTIFICATION_IDENTITY_INVALID");
      }

      const notificationId = String(notification.id);

      const dispatched = await publish({
        event: "notification.broadcast",
        delivery_type: "ROOM",
        room: `member:${job.user_id}`,
        payload: {
          notification: {
            id: notificationId,
            source_event: notification.source_event,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            data: notification.data,
            created_at: notification.created_at,
            delay_if_in_game: true,
          },
          popup: {
            id: notificationId,
            notification_id: notificationId,
            type: "daily_challenge_reward",
            reward_points:
              notification.data.reward_points,
            game_key: notification.data.game_key,
            delay_if_in_game: true,
          },
        },
        channel: "notification",
        timestamp: new Date().toISOString(),
      });

      if (dispatched === false) {
        throw Error("REVIVAL_NOTIFICATION_REALTIME_DISPATCH_FAILED");
      }

      const accepted = await repository.ack({
        ...identity,
        notificationId: created.notification_id,
      });

      if (accepted !== true) {
        throw Error("REVIVAL_NOTIFICATION_ACK_REJECTED");
      }

      return {
        processed: true,
        delivered: true,
        notification_id: notificationId,
        recovered: created.created === false,
      };

    } catch (error) {
      let failureRecorded = false;

      try {
        failureRecorded = await repository.fail({
          ...identity,
          error,
        }) === true;
      } catch (_) {
        // An expired lease remains recoverable.
      }

      return {
        processed: true,
        delivered: false,
        failure_recorded: failureRecorded,
        error: String(error?.message || error),
      };
    }
  }

  return { processOne };
}

function createProductionProcessor() {
  const repository = require(
    "../repositories/cingOfflineReviveRewardNotificationRepository"
  );
  const { realtimeEventBus } = require(
    "../../../realtime/realtimeEventBus"
  );

  return createNotificationProcessor({
    repository,
    publish: event => {
      if (realtimeEventBus.publish(event) !== true) {
        throw Error("REVIVAL_NOTIFICATION_REALTIME_DISPATCH_FAILED");
      }
    },
  });
}

module.exports = {
  createNotificationProcessor,
  createProductionProcessor,
};
