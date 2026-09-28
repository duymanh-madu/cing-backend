"use strict";

/*
 * CING GAME CENTER V2
 *
 * Backend bridge to the atomic PostgreSQL
 * Admin Challenge Apply authority.
 *
 * Admin identity comes exclusively from
 * the verified backend JWT context.
 *
 * This service does not write app_configs,
 * daily_challenges or snapshots directly.
 */

const supabase = require(
  "../../../supabase"
);

const {
  prepareRevivalAdminApply,
} = require(
  "./cingOfflineReviveAdminApplyContract"
);

async function applyRevivalAdminChallenges(
  {
    admin,
    applyRequestId,
    challenges,
  },
  client = supabase
) {
  /*
   * Pure validation runs before RPC.
   */

  const prepared =
    prepareRevivalAdminApply({
      admin,
      applyRequestId,
      challenges,
    });

  /*
   * The complete Admin list is passed to
   * PostgreSQL alongside the two compiled
   * Revival states.
   *
   * Chess remains inside full_challenges,
   * outside revival_challenges.
   */

  const {
    data,
    error,
  } = await client.rpc(
    "cing_offline_revive_admin_apply_v1",
    {
      p_apply_request_id:
        prepared.apply_request_id,

      p_actor_admin_id:
        prepared.actor_admin_id,

      p_full_challenges:
        challenges,

      p_revival_challenges:
        prepared.revival_challenges,
    }
  );

  if (error) {
    const message =
      String(error.message || "");

    const result = new Error(
      "REVIVAL_ADMIN_APPLY_FAILED"
    );

    result.code =
      "REVIVAL_ADMIN_APPLY_FAILED";

    result.statusCode = 500;

    if (
      error.code === "23505" &&
      message.includes(
        "REVIVAL_APPLY_REQUEST_CONFLICT"
      )
    ) {
      result.code =
        "REVIVAL_APPLY_REQUEST_CONFLICT";

      result.statusCode = 409;
    } else if (
      error.code === "42501" &&
      message.includes(
        "REVIVAL_APPLY_SUPER_ADMIN_REQUIRED"
      )
    ) {
      result.code =
        "REVIVAL_APPLY_SUPER_ADMIN_REQUIRED";

      result.statusCode = 403;
    } else if (
      error.code === "22023" &&
      message.startsWith(
        "REVIVAL_APPLY_"
      )
    ) {
      result.code =
        "REVIVAL_ADMIN_APPLY_INVALID";

      result.statusCode = 400;
    }

    throw result;
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.apply_request_id !==
      prepared.apply_request_id ||
    data.applied_at == null ||
    !Array.isArray(data.games) ||
    data.games.length !== 2
  ) {
    const result = new Error(
      "REVIVAL_ADMIN_APPLY_RESULT_INVALID"
    );

    result.code =
      "REVIVAL_ADMIN_APPLY_RESULT_INVALID";

    result.statusCode = 500;

    throw result;
  }

  return data;
}

module.exports = {
  applyRevivalAdminChallenges,
};
