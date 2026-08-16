const supabase =
  require(
    "../../../../supabase"
  );

const TABLE =
  "cing_artillery_combat_states";

const COMBAT_STATE_FIELDS =
  [
    "id",
    "match_runtime_id",
    "match_id",
    "player_one_account_id",
    "player_one_session_id",
    "player_two_account_id",
    "player_two_session_id",
    "status",
    "rules_version",
    "rules_snapshot",
    "player_one_stats_snapshot",
    "player_two_stats_snapshot",
    "initialized_at",
    "created_at",
    "updated_at",
  ].join(",");

async function findByMatchRuntimeId(
  matchRuntimeId
) {
  const {
    data,
    error,
  } = await supabase
    .from(TABLE)
    .select(
      COMBAT_STATE_FIELDS
    )
    .eq(
      "match_runtime_id",
      matchRuntimeId
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getOrCreateAtomic(
  matchRuntimeId
) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      "cing_artillery_get_or_create_combat_state_atomic",
      {
        p_match_runtime_id:
          matchRuntimeId,
      }
    );

  if (error) {
    throw error;
  }

  /*
   * Supabase/PostgREST may expose a composite-returning
   * PostgreSQL function as either one object or one-row
   * array depending on serialization behavior.
   */
  return Array.isArray(data)
    ? data[0] || null
    : data || null;
}

module.exports = {
  findByMatchRuntimeId,
  getOrCreateAtomic,
};
