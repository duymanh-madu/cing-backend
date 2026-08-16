const supabase =
  require(
    "../../../../supabase"
  );

const RPC_NAME =
  "cing_artillery_publish_map_version_atomic";

function encodeByteaHex(
  buffer
) {
  if (
    !Buffer.isBuffer(buffer)
  ) {
    throw new TypeError(
      "Cing Artillery collision mask must be a Buffer"
    );
  }

  return `\\x${buffer.toString("hex")}`;
}

async function publishAtomic({
  mapKey,
  version,
  displayName,
  widthPx,
  heightPx,
  collisionFormat,
  collisionMask,
  collisionMaskSha256,
  renderAssetKey,
  selectionWeight,
  spawnPairs,
}) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      RPC_NAME,
      {
        p_map_key:
          mapKey,

        p_version:
          version,

        p_display_name:
          displayName,

        p_width_px:
          widthPx,

        p_height_px:
          heightPx,

        p_collision_format:
          collisionFormat,

        p_collision_mask:
          encodeByteaHex(
            collisionMask
          ),

        p_collision_mask_sha256:
          collisionMaskSha256,

        p_render_asset_key:
          renderAssetKey,

        p_selection_weight:
          selectionWeight,

        p_spawn_pairs:
          spawnPairs,
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
  publishAtomic,
};
