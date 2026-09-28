const supabase =
  require("../../../../supabase");

const V5_REVIVE_RPC =
  "cing_block_puzzle_v5_revive_apply_v1";

async function applyV5ReviveAtomic({
  purchaseId,
  requestId,
  sessionId,
  userId,
  expectedContinueIndex,
  verifiedReplayFingerprint,
}) {
  const {
    data,
    error,
  } = await supabase.rpc(
    V5_REVIVE_RPC,
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

      p_verified_replay_fingerprint:
        verifiedReplayFingerprint,
    }
  );

  if (error) {
    throw error;
  }

  const row =
    Array.isArray(data)
      ? data.length === 1
        ? data[0]
        : null
      : data;

  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row)
  ) {
    throw new Error(
      "Block Puzzle V5 revive RPC returned invalid payload"
    );
  }

  return row;
}

module.exports = {
  V5_REVIVE_RPC,
  applyV5ReviveAtomic,
};
