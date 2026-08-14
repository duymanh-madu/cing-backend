const supabase =
  require(
    "../../../../supabase"
  );

const TABLE =
  "cing_artillery_accounts";

const ACCOUNT_FIELDS =
  [
    "id",
    "user_id",
    "status",
    "created_at",
    "updated_at",
  ].join(",");

async function findByUserId(
  userId
) {
  const {
    data,
    error,
  } = await supabase
    .from(TABLE)
    .select(
      ACCOUNT_FIELDS
    )
    .eq(
      "user_id",
      userId
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function create({
  id,
  userId,
  status,
}) {
  const {
    data,
    error,
  } = await supabase
    .from(TABLE)
    .insert({
      id,
      user_id:
        userId,
      status,
    })
    .select(
      ACCOUNT_FIELDS
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  findByUserId,
  create,
};
