"use strict";

const supabase =
  require(
    "../../../../supabase"
  );

const EFFECTIVE_GAMEPLAY_ACCESS_RPC =
  "cing_artillery_has_effective_gameplay_access_v1";

async function hasEffectiveGameplayAccess(
  userId
) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      EFFECTIVE_GAMEPLAY_ACCESS_RPC,
      {
        p_user_id:
          userId,
      }
    );

  if (error) {
    throw error;
  }

  if (
    typeof data !== "boolean"
  ) {
    const repositoryError =
      new Error(
        "Effective gameplay access RPC Cing Artillery trả representation không hợp lệ"
      );

    repositoryError.code =
      "CING_ARTILLERY_EFFECTIVE_ACCESS_RPC_RESPONSE_INVALID";

    throw repositoryError;
  }

  return data;
}

module.exports = {
  EFFECTIVE_GAMEPLAY_ACCESS_RPC,
  hasEffectiveGameplayAccess,
};
