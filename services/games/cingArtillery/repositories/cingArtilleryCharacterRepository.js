const supabase =
  require(
    "../../../../supabase"
  );

const TABLE =
  "cing_artillery_characters";

const CHARACTER_FIELDS =
  [
    "account_id",
    "character_key",
    "character_name",
    "gender",
    "created_at",
    "updated_at",
  ].join(",");

async function findByAccountId(
  accountId
) {
  const {
    data,
    error,
  } = await supabase
    .from(TABLE)
    .select(
      CHARACTER_FIELDS
    )
    .eq(
      "account_id",
      accountId
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function createDefault({
  accountId,
}) {
  const {
    data,
    error,
  } = await supabase
    .from(TABLE)
    .insert({
      account_id:
        accountId,
    })
    .select(
      CHARACTER_FIELDS
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function updateIdentity({
  accountId,
  characterName,
  gender,
}) {
  const {
    data,
    error,
  } = await supabase
    .from(TABLE)
    .update({
      character_name:
        characterName,

      gender,

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "account_id",
      accountId
    )
    .select(
      CHARACTER_FIELDS
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  findByAccountId,
  createDefault,
  updateIdentity,
};
