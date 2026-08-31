const supabase =
  require(
    "../../../../supabase"
  );

const RPC_NAME =
  "cing_artillery_bootstrap_mutable_authority_atomic";

async function bootstrapAtomic(
  combatStateId
) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      RPC_NAME,
      {
        p_combat_state_id:
          combatStateId,
      }
    );

  if (error) {
    throw error;
  }

  return data || null;
}

module.exports = {
  bootstrapAtomic,
};
