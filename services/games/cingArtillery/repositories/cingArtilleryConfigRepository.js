const supabase =
  require(
    "../../../../supabase"
  );

const TABLE =
  "app_configs";

const ROOT_CONFIG_ID =
  1;

async function getRuntimeConfig() {
  const {
    data,
    error,
  } = await supabase
    .from(TABLE)
    .select(
      "cing_artillery_config"
    )
    .eq(
      "id",
      ROOT_CONFIG_ID
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (
    data?.cing_artillery_config ||
    null
  );
}

module.exports = {
  getRuntimeConfig,
};
