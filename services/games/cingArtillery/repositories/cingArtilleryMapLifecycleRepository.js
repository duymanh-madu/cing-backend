const supabase =
  require(
    "../../../../supabase"
  );

const RPC_NAME =
  "cing_artillery_set_map_version_enabled_atomic";

async function setEnabledAtomic({
  mapId,
  enabled,
}) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      RPC_NAME,
      {
        p_map_id:
          mapId,

        p_enabled:
          enabled,
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
  setEnabledAtomic,
};
