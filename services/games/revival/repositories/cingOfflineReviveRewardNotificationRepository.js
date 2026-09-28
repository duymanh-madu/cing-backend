"use strict";

/*
 * Revival reward notification repository.
 * PostgreSQL owns identity, lease and ACK.
 * No work starts on import.
 */

const supabase = require("../../../../supabase");

function oneRow(data) {
  return (Array.isArray(data) ? data[0] : data) || null;
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

async function claim({ leaseSeconds = 300 } = {}) {
  return oneRow(await rpc(
    "cing_offline_revive_reward_notification_claim_v1",
    { p_lease_seconds: leaseSeconds }
  ));
}

async function create({ scoreId, workerToken }) {
  const result = oneRow(await rpc(
    "cing_offline_revive_reward_notification_create_v1",
    {
      p_score_id: scoreId,
      p_worker_token: workerToken,
    }
  ));

  const id = result?.notification_id;

  if (
    !result ||
    !(
      typeof id === "string" &&
      /^[1-9][0-9]*$/.test(id)
      ||
      typeof id === "number" &&
      Number.isSafeInteger(id) &&
      id > 0
    ) ||
    typeof result.created !== "boolean"
  ) {
    throw Error("REVIVAL_NOTIFICATION_CREATE_RESULT_INVALID");
  }

  return result;
}

async function ack({
  scoreId, workerToken, notificationId,
}) {
  return await rpc(
    "cing_offline_revive_reward_notification_ack_v1",
    {
      p_score_id: scoreId,
      p_worker_token: workerToken,
      p_notification_id: notificationId,
    }
  ) === true;
}

async function fail({ scoreId, workerToken, error }) {
  const message = String(error?.message || error || "");

  if (!message.trim()) {
    throw Error("REVIVAL_NOTIFICATION_FAILURE_REASON_REQUIRED");
  }

  return await rpc(
    "cing_offline_revive_reward_notification_fail_v1",
    {
      p_score_id: scoreId,
      p_worker_token: workerToken,
      p_error: message.slice(0, 1000),
    }
  ) === true;
}


async function getNotification({ notificationId }) {
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id,user_id,title,message,type,source_event,metadata,data,created_at"
    )
    .eq("id", notificationId)
    .maybeSingle();

  if (error) throw error;

  if (
    !data ||
    data.source_event !==
      "cing_offline_revive_daily_reward"
  ) {
    throw Error(
      "REVIVAL_NOTIFICATION_PERSISTED_RECORD_INVALID"
    );
  }

  return data;
}

module.exports = {
  claim,
  create,
  getNotification,
  ack,
  fail,
};
