"use strict";

const supabase = require("../../../../supabase");

const SCORE_ID_MAX = 9223372036854775807n;

function normalizeScoreId(value) {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "bigint"
  ) {
    throw new Error(
      "REVIVAL_DELIVERY_SCORE_ID_INVALID"
    );
  }

  if (
    typeof value === "number" &&
    !Number.isSafeInteger(value)
  ) {
    throw new Error(
      "REVIVAL_DELIVERY_SCORE_ID_UNSAFE"
    );
  }

  const text = String(value);

  if (
    !/^[1-9][0-9]*$/.test(text)
  ) {
    throw new Error(
      "REVIVAL_DELIVERY_SCORE_ID_INVALID"
    );
  }

  const parsed = BigInt(text);

  if (parsed > SCORE_ID_MAX) {
    throw new Error(
      "REVIVAL_DELIVERY_SCORE_ID_OUT_OF_RANGE"
    );
  }

  return parsed.toString();
}

function normalizeToken(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error(
      "REVIVAL_DELIVERY_WORKER_TOKEN_INVALID"
    );
  }

  return value;
}

function requireLeaseSeconds(value) {
  if (
    !Number.isInteger(value) ||
    value < 30 ||
    value > 900
  ) {
    throw new Error(
      "REVIVAL_DELIVERY_LEASE_INVALID"
    );
  }

  return value;
}

function expectOneRow(data, operation) {
  const row = Array.isArray(data)
    ? data[0]
    : data;

  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row)
  ) {
    throw new Error(
      `REVIVAL_DELIVERY_${operation}_RESPONSE_INVALID`
    );
  }

  return row;
}

async function callRpc(name, params) {
  const { data, error } =
    await supabase.rpc(name, params);

  if (error) {
    throw error;
  }

  return data;
}

/*
 * Exactly one claimed job or no job.
 *
 * PostgreSQL remains responsible
 * for concurrent claiming and lease tokens.
 */

async function claim({
  leaseSeconds = 300,
} = {}) {
  const data = await callRpc(
    "cing_offline_revive_score_claim_v1",
    {
      p_lease_seconds:
        requireLeaseSeconds(leaseSeconds),
    }
  );

  const row = Array.isArray(data)
    ? data[0]
    : data;

  if (!row) {
    return null;
  }

  return {
    ...row,
    score_id:
      normalizeScoreId(row.score_id),
    worker_token:
      normalizeToken(row.worker_token),
  };
}

/*
 * A failed or expired lease must
 * return false, not success.
 */

async function renew({
  scoreId,
  workerToken,
  leaseSeconds = 300,
}) {
  const data = await callRpc(
    "cing_offline_revive_score_renew_v1",
    {
      p_score_id:
        normalizeScoreId(scoreId),
      p_worker_token:
        normalizeToken(workerToken),
      p_lease_seconds:
        requireLeaseSeconds(leaseSeconds),
    }
  );

  if (typeof data !== "boolean") {
    throw new Error(
      "REVIVAL_DELIVERY_RENEW_RESPONSE_INVALID"
    );
  }

  return data;
}

/*
 * Atomic analytics authority:
 *
 * The RPC writes the event and
 * analytics_done in ONE transaction.
 *
 * Never call ACK('analytics')
 * after this method.
 */

async function deliverAnalytics({
  scoreId,
  workerToken,
}) {
  const data = await callRpc(
    "cing_offline_revive_score_analytics_v1",
    {
      p_score_id:
        normalizeScoreId(scoreId),
      p_worker_token:
        normalizeToken(workerToken),
    }
  );

  const row = expectOneRow(
    data,
    "ANALYTICS"
  );

  if (
    typeof row.accepted !== "boolean" ||
    typeof row.created !== "boolean"
  ) {
    throw new Error(
      "REVIVAL_DELIVERY_ANALYTICS_RESPONSE_INVALID"
    );
  }

  return row;
}

/*
 * Only leaderboard and top1
 * stages are acknowledged here.
 *
 * Analytics has its own atomic RPC.
 */

async function ackStage({
  scoreId,
  workerToken,
  stage,
}) {
  if (
    stage !== "leaderboard" &&
    stage !== "top1"
  ) {
    throw new Error(
      "REVIVAL_DELIVERY_STAGE_INVALID"
    );
  }

  const data = await callRpc(
    "cing_offline_revive_score_ack_stage_v1",
    {
      p_score_id:
        normalizeScoreId(scoreId),
      p_worker_token:
        normalizeToken(workerToken),
      p_stage: stage,
    }
  );

  const row = expectOneRow(
    data,
    "ACK"
  );

  for (const key of [
    "accepted",
    "completed",
    "analytics_done",
    "leaderboard_done",
    "top1_done",
  ]) {
    if (typeof row[key] !== "boolean") {
      throw new Error(
        "REVIVAL_DELIVERY_ACK_RESPONSE_INVALID"
      );
    }
  }

  return row;
}

async function fail({
  scoreId,
  workerToken,
  error,
}) {
  const message =
    String(error?.message || error || "")
      .trim()
      .slice(0, 1000);

  if (!message) {
    throw new Error(
      "REVIVAL_DELIVERY_FAILURE_REASON_INVALID"
    );
  }

  const data = await callRpc(
    "cing_offline_revive_score_fail_v1",
    {
      p_score_id:
        normalizeScoreId(scoreId),
      p_worker_token:
        normalizeToken(workerToken),
      p_error: message,
    }
  );

  if (typeof data !== "boolean") {
    throw new Error(
      "REVIVAL_DELIVERY_FAIL_RESPONSE_INVALID"
    );
  }

  return data;
}

/*
 * The worker reads persisted score
 * fields only, never frontend payload.
 */

async function getScore({
  scoreId,
  sessionId,
  gameKey,
  userId,
}) {
  const id =
    normalizeScoreId(scoreId);

  if (
    typeof sessionId !== "string" ||
    typeof gameKey !== "string" ||
    typeof userId !== "string" ||
    !sessionId ||
    !gameKey ||
    !userId
  ) {
    throw new Error(
      "REVIVAL_DELIVERY_SCORE_BINDING_INVALID"
    );
  }

  const { data, error } =
    await supabase
      .from("game_scores")
      .select(
        "id, offline_revive_session_id, game_key, user_id, player_name, avatar, score, played_at"
      )
      .eq("id", id)
      .eq(
        "offline_revive_session_id",
        sessionId
      )
      .eq("game_key", gameKey)
      .eq("user_id", userId)
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (
    !data ||
    normalizeScoreId(data.id) !== id
  ) {
    throw new Error(
      "REVIVAL_DELIVERY_SCORE_NOT_FOUND"
    );
  }

  return {
    ...data,
    id,
  };
}

/*
 * Read a PostgreSQL-finalized session only.
 *
 * Bind session, game and owner to the claimed
 * score job. Never trust a frontend result.
 * No session mutation or score mutation.
 */
async function getFinalizedSession({
  sessionId,
  gameKey,
  userId,
}) {
  if (
    typeof sessionId !== "string" ||
    typeof gameKey !== "string" ||
    typeof userId !== "string" ||
    !sessionId ||
    !gameKey ||
    !userId
  ) {
    throw new Error(
      "REVIVAL_DELIVERY_SESSION_BINDING_INVALID"
    );
  }

  const { data, error } = await supabase
    .from("cing_offline_revive_sessions")
    .select(
      [
        "id",
        "user_id",
        "game_key",
        "status",
        "final_score",
        "final_best_combo",
        "finalized_at",
      ].join(",")
    )
    .eq("id", sessionId)
    .eq("game_key", gameKey)
    .eq("user_id", userId)
    .eq("status", "finalized")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (
    !data ||
    data.id !== sessionId ||
    data.game_key !== gameKey ||
    data.user_id !== userId ||
    data.status !== "finalized" ||
    !Number.isSafeInteger(data.final_score) ||
    data.final_score < 0 ||
    data.final_score > 1000000 ||
    !Number.isSafeInteger(data.final_best_combo) ||
    data.final_best_combo < 0 ||
    data.final_best_combo > 1000000 ||
    typeof data.finalized_at !== "string" ||
    !Number.isFinite(Date.parse(data.finalized_at))
  ) {
    throw new Error(
      "REVIVAL_DELIVERY_FINALIZED_SESSION_INVALID"
    );
  }

  return data;
}

/*
 * Read the analytics event created
 * by the atomic PostgreSQL RPC.
 *
 * This contains historical bests
 * determined by database authority.
 */

async function getAnalyticsEvent({
  scoreId,
  userId,
}) {
  const id =
    normalizeScoreId(scoreId);

  if (
    typeof userId !== "string" ||
    !userId
  ) {
    throw new Error(
      "REVIVAL_DELIVERY_USER_INVALID"
    );
  }

  const { data, error } =
    await supabase
      .from("analytics_events")
      .select(
        "user_id, event_name, event_data"
      )
      .eq(
        "event_name",
        "game_score"
      )
      .eq(
        "user_id",
        userId
      )
      .eq(
        "event_data->>offline_revive_score_id",
        id
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (
    !data ||
    data.user_id !== userId ||
    data.event_name !== "game_score" ||
    String(
      data.event_data
        ?.offline_revive_score_id
    ) !== id
  ) {
    throw new Error(
      "REVIVAL_DELIVERY_ANALYTICS_NOT_FOUND"
    );
  }

  return data;
}

module.exports = {
  claim,
  renew,
  deliverAnalytics,
  ackStage,
  fail,
  getScore,
  getFinalizedSession,
  getAnalyticsEvent,
};
