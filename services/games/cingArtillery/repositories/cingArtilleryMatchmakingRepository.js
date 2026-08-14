const supabase =
  require(
    "../../../../supabase"
  );

async function enterAtomic({
  accountId,
  gameplaySessionId,
}) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      "cing_artillery_enter_matchmaking_atomic",
      {
        p_account_id:
          accountId,

        p_gameplay_session_id:
          gameplaySessionId,
      }
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  enterAtomic,
};
