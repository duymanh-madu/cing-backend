const supabase =
  require("../../../../supabase");

const START_SESSION_RPC =
  "cing_block_puzzle_start_session_atomic";

const SUBMIT_SESSION_RPC =
  "cing_block_puzzle_submit_session_atomic_v2";

const PURCHASE_CONTINUE_RPC =
  "cing_block_puzzle_purchase_continue_atomic";

async function startSessionAtomic({
  sessionId,
  requestId,
  userId,
  seed,
  engineVersion,
  rulesVersion,
  scoreVersion,
  replayVersion,
  ttlSeconds,
}) {
  const {
    data,
    error,
  } = await supabase.rpc(
    START_SESSION_RPC,
    {
      p_session_id:
        sessionId,

      p_request_id:
        requestId,

      p_user_id:
        userId,

      p_seed:
        seed,

      p_engine_version:
        engineVersion,

      p_rules_version:
        rulesVersion,

      p_score_version:
        scoreVersion,

      p_replay_version:
        replayVersion,

      p_ttl_seconds:
        ttlSeconds,
    }
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
    typeof row !== "object"
  ) {
    throw new Error(
      "Cing Block Puzzle start-session RPC returned invalid payload"
    );
  }

  return row;
}

async function getSessionForSubmission(
  sessionId
) {
  const {
    data,
    error,
  } = await supabase
    .from(
      "cing_block_puzzle_sessions"
    )
    .select(
      [
        "id",
        "user_id",
        "game_key",
        "seed",
        "engine_version",
        "rules_version",
        "score_version",
        "replay_version",
        "play_cost",
        "status",
        "created_at",
        "expires_at",
        "submitted_at",
        "verified_score",
        "replay_fingerprint",
        "move_count",
        "continue_count",
      ].join(",")
    )
    .eq(
      "id",
      sessionId
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function submitSessionAtomic({
  sessionId,
  userId,
  verifiedScore,
  replayFingerprint,
  moveCount,
  bestCombo,
  totalLinesCleared,
  continuesUsed,
}) {
  const {
    data,
    error,
  } = await supabase.rpc(
    SUBMIT_SESSION_RPC,
    {
      p_session_id:
        sessionId,

      p_user_id:
        userId,

      p_verified_score:
        verifiedScore,

      p_replay_fingerprint:
        replayFingerprint,

      p_move_count:
        moveCount,

      p_best_combo:
        bestCombo,

      p_total_lines_cleared:
        totalLinesCleared,

      p_continues_used:
        continuesUsed,
    }
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
    typeof row !== "object"
  ) {
    throw new Error(
      "Cing Block Puzzle submit-session RPC returned invalid payload"
    );
  }

  return row;
}

async function purchaseContinueAtomic({
  purchaseId,
  requestId,
  sessionId,
  userId,
  expectedContinueIndex,
}) {
  const {
    data,
    error,
  } = await supabase.rpc(
    PURCHASE_CONTINUE_RPC,
    {
      p_purchase_id:
        purchaseId,

      p_request_id:
        requestId,

      p_session_id:
        sessionId,

      p_user_id:
        userId,

      p_expected_continue_index:
        expectedContinueIndex,
    }
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
    typeof row !== "object"
  ) {
    throw new Error(
      "Cing Block Puzzle continue-purchase RPC returned invalid payload"
    );
  }

  return row;
}

module.exports = {
  startSessionAtomic,
  getSessionForSubmission,
  submitSessionAtomic,
  purchaseContinueAtomic,
};
