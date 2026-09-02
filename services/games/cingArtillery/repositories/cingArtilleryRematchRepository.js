"use strict";

const {
  supabase,
} = require(
  "../../../../services/supabase"
);

async function requestSameOpponentRematchAtomic({
  sourceMatchId,
  accountId,
}) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "cing_artillery_request_same_opponent_rematch_atomic_v1",
      {
        p_source_match_id:
          sourceMatchId,

        p_account_id:
          accountId,
      }
    );

  if (error) {
    throw error;
  }

  if (
    !Array.isArray(data) ||
    data.length !== 1
  ) {
    throw new Error(
      "CING_ARTILLERY_REMATCH_RESULT_INVALID"
    );
  }

  return data[0];
}

module.exports = {
  requestSameOpponentRematchAtomic,
};
