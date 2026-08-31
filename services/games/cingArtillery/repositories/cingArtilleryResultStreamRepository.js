"use strict";

const supabase =
  require(
    "../../../../supabase"
  );

const READ_RPC_NAME =
  "cing_artillery_read_result_stream_authorized_v2";

const HEAD_RPC_NAME =
  "cing_artillery_read_result_stream_head_authorized_v1";

async function readAuthorized({
  matchId,
  matchRuntimeId,
  accountId,
  afterSequence,
  limit,
}) {
  const {
    data,
    error,
  } = await supabase.rpc(
    READ_RPC_NAME,
    {
      p_match_id:
        matchId,
      p_match_runtime_id:
        matchRuntimeId,
      p_account_id:
        accountId,
      p_after_sequence:
        afterSequence,
      p_limit:
        limit,
    }
  );

  if (error) {
    throw error;
  }

  return Array.isArray(data)
    ? data
    : data
      ? [data]
      : [];
}

async function readHeadAuthorized({
  matchId,
  matchRuntimeId,
  accountId,
}) {
  const {
    data,
    error,
  } = await supabase.rpc(
    HEAD_RPC_NAME,
    {
      p_match_id:
        matchId,
      p_match_runtime_id:
        matchRuntimeId,
      p_account_id:
        accountId,
    }
  );

  if (error) {
    throw error;
  }

  return data === null ||
    data === undefined
    ? "0"
    : String(data);
}

module.exports = {
  readAuthorized,
  readHeadAuthorized,
};
