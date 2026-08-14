const supabase =
  require(
    "../../../../supabase"
  );

const TABLE =
  "cing_artillery_match_runtimes";

const RUNTIME_FIELDS =
  [
    "id",
    "match_id",
    "player_one_account_id",
    "player_one_session_id",
    "player_two_account_id",
    "player_two_session_id",
    "status",
    "initialized_at",
    "created_at",
    "updated_at",
  ].join(",");

const RPC_NAME =
  "cing_artillery_get_or_create_match_runtime_atomic";

async function findByMatchId(
  matchId
) {
  const {
    data,
    error,
  } = await supabase
    .from(TABLE)
    .select(
      RUNTIME_FIELDS
    )
    .eq(
      "match_id",
      matchId
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getOrCreateAtomic({
  matchId,
}) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      RPC_NAME,
      {
        p_match_id:
          matchId,
      }
    );

  if (error) {
    throw error;
  }

  /*
   * Keep repository tolerant to PostgREST representation
   * of a single composite-returning PostgreSQL function.
   */
  return Array.isArray(
    data
  )
    ? data[0] || null
    : data || null;
}

module.exports = {
  findByMatchId,
  getOrCreateAtomic,
};
