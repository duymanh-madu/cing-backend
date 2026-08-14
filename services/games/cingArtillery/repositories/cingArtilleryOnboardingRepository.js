const supabase =
  require(
    "../../../../supabase"
  );

const RPC_NAME =
  "onboard_cing_artillery_character_atomic";

async function onboardAtomic({
  userId,
  characterName,
  gender,
}) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      RPC_NAME,
      {
        p_user_id:
          userId,

        p_character_name:
          characterName,

        p_gender:
          gender,
      }
    );

  if (error) {
    throw error;
  }

  return Array.isArray(
    data
  )
    ? data[0] || null
    : data || null;
}

module.exports = {
  onboardAtomic,
};
