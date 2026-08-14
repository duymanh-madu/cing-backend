const supabase =
  require(
    "../../../../supabase"
  );

const TABLE =
  "cing_artillery_gameplay_sessions";

const SESSION_FIELDS =
  [
    "id",
    "account_id",
    "status",
    "started_at",
    "ended_at",
    "created_at",
    "updated_at",
  ].join(",");

async function findActiveByAccountId(
  accountId
) {
  const {
    data,
    error,
  } = await supabase
    .from(TABLE)
    .select(
      SESSION_FIELDS
    )
    .eq(
      "account_id",
      accountId
    )
    .eq(
      "status",
      "active"
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function createActive({
  id,
  accountId,
}) {
  const {
    data,
    error,
  } = await supabase
    .from(TABLE)
    .insert({
      id,

      account_id:
        accountId,

      status:
        "active",
    })
    .select(
      SESSION_FIELDS
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  findActiveByAccountId,
  createActive,
};
