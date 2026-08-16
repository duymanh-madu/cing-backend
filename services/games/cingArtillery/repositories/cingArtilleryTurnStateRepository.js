const supabase =
  require(
    "../../../../supabase"
  );

const TABLE =
  "cing_artillery_turn_states";

const TURN_STATE_FIELDS =
  [
    "id",
    "combat_state_id",
    "match_runtime_id",
    "match_id",
    "player_one_account_id",
    "player_one_session_id",
    "player_two_account_id",
    "player_two_session_id",
    "status",
    "turn_number",
    "active_account_id",
    "active_session_id",
    "turn_started_at",
    "turn_deadline_at",
    "created_at",
    "updated_at",
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
      TURN_STATE_FIELDS
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
      "cing_artillery_get_or_create_turn_state_atomic",
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
