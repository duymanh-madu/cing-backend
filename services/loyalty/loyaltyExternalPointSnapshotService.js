const supabase =
  require("../../supabase");

const RPC =
  "cing_loyalty_apply_external_point_snapshot_guarded";

async function
applyExternalPointSnapshotGuarded({
  userId,
  externalPoints,
}) {
  const normalizedUserId =
    String(userId || "").trim();

  const normalizedPoints =
    Number(externalPoints);

  if (!normalizedUserId) {
    throw new Error(
      "external point snapshot user_id is required"
    );
  }

  if (
    !Number.isSafeInteger(
      normalizedPoints
    ) ||
    normalizedPoints < 0
  ) {
    throw new Error(
      "external point snapshot points are invalid"
    );
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    RPC,
    {
      p_user_id:
        normalizedUserId,

      p_external_points:
        normalizedPoints,
    }
  );

  if (error) {
    throw error;
  }

  const row =
    Array.isArray(data)
      ? data[0]
      : data;

  if (
    !row ||
    typeof row !== "object" ||
    typeof row.applied !==
      "boolean" ||
    typeof row.protected !==
      "boolean"
  ) {
    throw new Error(
      "external point snapshot RPC returned invalid payload"
    );
  }

  const totalPoints =
    Number(
      row.total_points
    );

  if (
    !Number.isSafeInteger(
      totalPoints
    ) ||
    totalPoints < 0
  ) {
    throw new Error(
      "external point snapshot balance is invalid"
    );
  }

  return Object.freeze({
    applied:
      row.applied,

    protected:
      row.protected,

    balance_before:
      row.balance_before ===
        null
        ? null
        : Number(
            row.balance_before
          ),

    total_points:
      totalPoints,
  });
}

module.exports = {
  applyExternalPointSnapshotGuarded,
};
