const supabase =
  require(
    "../../../../supabase"
  );

const TABLE =
  "cing_artillery_combat_vital_states";

const RPC_NAME =
  "cing_artillery_get_or_create_combat_vital_state_atomic";

const FIELDS =
  [
    "id",
    "combat_state_id",
    "match_runtime_id",
    "match_id",
    "player_one_account_id",
    "player_two_account_id",
    "player_one_current_hp",
    "player_two_current_hp",
    "initialized_at",
    "updated_at",
    "created_at",
  ].join(",");

async function findByCombatStateId(
  combatStateId
) {
  const {
    data,
    error,
  } = await supabase
    .from(TABLE)
    .select(FIELDS)
    .eq(
      "combat_state_id",
      combatStateId
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getOrCreateAtomic(
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

  return Array.isArray(data)
    ? data[0] || null
    : data || null;
}

module.exports = {
  findByCombatStateId,
  getOrCreateAtomic,
};
