const supabase =
  require("../../../supabase");

const START_SESSION_RPC =
  "cing_block_puzzle_start_session_atomic";

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

module.exports = {
  startSessionAtomic,
};
