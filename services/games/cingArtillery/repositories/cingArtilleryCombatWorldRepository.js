const supabase =
  require(
    "../../../../supabase"
  );

const TABLE =
  "cing_artillery_combat_world_states";

const RPC_NAME =
  "cing_artillery_get_or_create_combat_world_atomic";

const COMBAT_WORLD_FIELDS =
  [
    "id",
    "combat_state_id",
    "match_runtime_id",
    "match_id",
    "map_id",
    "spawn_pair_id",
    "player_one_side",
    "player_two_side",
    "player_one_x",
    "player_one_y",
    "player_two_x",
    "player_two_y",
    "initial_wind",
    "initialized_at",
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
    .select(
      COMBAT_WORLD_FIELDS
    )
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
