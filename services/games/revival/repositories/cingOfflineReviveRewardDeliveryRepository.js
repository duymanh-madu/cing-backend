"use strict";

/*
 * CING GAME CENTER V2
 * Reward Delivery PostgreSQL repository.
 *
 * No work starts on import.
 * No direct balance or ledger writes.
 * No Score Delivery mutation.
 */

const supabase = require("../../../../supabase");

function oneRow(data) {
  const row = Array.isArray(data)
    ? data[0]
    : data;

  return row || null;
}

async function rpc(name, params) {
  const { data, error } =
    await supabase.rpc(name, params);

  if (error) {
    throw error;
  }

  return data;
}

async function claim({
  leaseSeconds = 300,
} = {}) {
  return oneRow(
    await rpc(
      "cing_offline_revive_reward_claim_v1",
      {
        p_lease_seconds: leaseSeconds,
      }
    )
  );
}

async function renew({
  scoreId,
  workerToken,
  leaseSeconds = 300,
}) {
  return await rpc(
    "cing_offline_revive_reward_renew_v1",
    {
      p_score_id: scoreId,
      p_worker_token: workerToken,
      p_lease_seconds: leaseSeconds,
    }
  ) === true;
}

async function award({
  sessionId,
  userId,
  workerToken,
}) {
  const result = oneRow(
    await rpc(
      "cing_offline_revive_challenge_reward_v1",
      {
        p_session_id: sessionId,
        p_user_id: userId,
        p_worker_token: workerToken,
      }
    )
  );

  if (!result ||
    typeof result.applied !== "boolean"
  ) {
    throw new Error(
      "REVIVAL_REWARD_RPC_INVALID_RESULT"
    );
  }

  return result;
}

async function ack({
  scoreId,
  workerToken,
  outcome,
  reason = null,
}) {
  const result = oneRow(
    await rpc(
      "cing_offline_revive_reward_ack_v1",
      {
        p_score_id: scoreId,
        p_worker_token: workerToken,
        p_outcome: outcome,
        p_reason: reason,
      }
    )
  );

  if (!result ||
    result.accepted !== true
  ) {
    throw new Error(
      "REVIVAL_REWARD_ACK_REJECTED"
    );
  }

  return result;
}

async function fail({
  scoreId,
  workerToken,
  error,
}) {
  const message = String(
    error?.message || error || ""
  );

  if (!message.trim()) {
    throw new Error(
      "REVIVAL_REWARD_FAILURE_REASON_REQUIRED"
    );
  }

  return await rpc(
    "cing_offline_revive_reward_fail_v1",
    {
      p_score_id: scoreId,
      p_worker_token: workerToken,
      p_error: message.slice(0, 1000),
    }
  ) === true;
}

module.exports = {
  claim,
  renew,
  award,
  ack,
  fail,
};
