"use strict";

const supabase = require("../../../../supabase");

const START_RPC =
  "cing_offline_revive_start_v1";

const PENDING_RPC =
  "cing_offline_revive_pending_v1";

const APPLY_RPC =
  "cing_offline_revive_apply_v1";

const FINALIZE_RPC =
  "cing_offline_revive_finalize_v1";

const ABANDON_RPC =
  "cing_offline_revive_abandon_v1";

/*
 * Each database function returns exactly one
 * result row.
 *
 * Preserve PostgreSQL errors for the service
 * layer to map into the public API contract.
 */

async function callRevivalRpc(
  functionName,
  parameters
) {
  const { data, error } =
    await supabase.rpc(
      functionName,
      parameters
    );

  if (error) {
    throw error;
  }

  const row =
    Array.isArray(data)
      ? data[0]
      : data;

  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row)
  ) {
    const failure = new Error(
      "Offline revival RPC returned invalid payload"
    );

    failure.code =
      "REVIVAL_RPC_INVALID_PAYLOAD";

    failure.statusCode = 500;

    throw failure;
  }

  return row;
}

async function startOfflineReviveSession({
  userId,
  requestId,
  gameKey,
}) {
  return callRevivalRpc(
    START_RPC,
    {
      p_user_id: userId,
      p_request_id: requestId,
      p_game_key: gameKey,
    }
  );
}

async function markOfflineRevivePending({
  userId,
  sessionId,
  requestId,
  expectedEventSeq,
  reason,
}) {
  return callRevivalRpc(
    PENDING_RPC,
    {
      p_user_id: userId,
      p_session_id: sessionId,
      p_request_id: requestId,
      p_expected_event_seq:
        expectedEventSeq,
      p_reason: reason,
    }
  );
}

async function applyOfflineRevival({
  userId,
  sessionId,
  requestId,
  expectedEventSeq,
  pendingEventId,
}) {
  return callRevivalRpc(
    APPLY_RPC,
    {
      p_user_id: userId,
      p_session_id: sessionId,
      p_request_id: requestId,
      p_expected_event_seq:
        expectedEventSeq,
      p_pending_event_id:
        pendingEventId,
    }
  );
}

async function abandonOfflineReviveSession({
  userId,
  sessionId,
  requestId,
  expectedEventSeq,
}) {
  return callRevivalRpc(
    ABANDON_RPC,
    {
      p_user_id: userId,
      p_session_id: sessionId,
      p_request_id: requestId,
      p_expected_event_seq:
        expectedEventSeq,
    }
  );
}


async function finalizeOfflineReviveSession({
  userId,
  sessionId,
  requestId,
  expectedEventSeq,
  finalScore,
  finalBestCombo,
  playerName,
  avatar,
}) {
  return callRevivalRpc(
    FINALIZE_RPC,
    {
      p_user_id: userId,
      p_session_id: sessionId,
      p_request_id: requestId,
      p_expected_event_seq:
        expectedEventSeq,
      p_final_score: finalScore,
      p_final_best_combo:
        finalBestCombo,
      p_player_name: playerName,
      p_avatar: avatar,
    }
  );
}


/*
 * Game Center V2 read-only recovery repository.
 *
 * The service layer must bind userId to the
 * authenticated customer before calling these reads.
 *
 * No client-provided balance or session owner
 * is accepted as financial authority.
 */

async function readOfflineReviveCreditBalance({
  userId,
}) {
  const { data, error } = await supabase
    .from("cing_revive_credit_balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  /*
   * A player without a credit balance row
   * has zero available credits.
   */
  return data?.balance ?? 0;
}

async function recoverOfflineReviveSession({
  userId,
  requestId,
}) {
  const { data, error } = await supabase
    .from("cing_offline_revive_sessions")
    .select(
      [
        "id",
        "request_id",
        "user_id",
        "game_key",
        "status",
        "revives_used",
        "event_seq",
        "pending_reason",
        "pending_at",
        "created_at",
        "expires_at",
        "finalized_at",
        "abandoned_at",
      ].join(",")
    )
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function readOfflineRevivePendingEvent({
  userId,
  sessionId,
  eventSeq,
}) {
  const { data, error } = await supabase
    .from("cing_offline_revive_events")
    .select(
      "id,session_id,user_id,event_seq,event_type,pending_reason"
    )
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("event_seq", eventSeq)
    .eq("event_type", "revive_pending")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

module.exports = {
  startOfflineReviveSession,
  markOfflineRevivePending,
  applyOfflineRevival,
  abandonOfflineReviveSession,
  finalizeOfflineReviveSession,
  readOfflineReviveCreditBalance,
  recoverOfflineReviveSession,
  readOfflineRevivePendingEvent,
};
