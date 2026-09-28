"use strict";

/*
 * CING GAME CENTER V2
 *
 * Pure request boundary for a future
 * atomic Admin Challenge apply RPC.
 *
 * The caller MUST provide req.admin from
 * the existing verified Admin JWT.
 *
 * Never accept actor_admin_id or role
 * from req.body.
 *
 * applyRequestId must remain identical
 * across retries of the same Admin action.
 *
 * This module performs no DB writes.
 */

const {
  compileRevivalAdminChallenges,
} = require(
  "./cingOfflineReviveAdminChallengeCompiler"
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(
  code,
  statusCode
) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function prepareRevivalAdminApply({
  admin,
  applyRequestId,
  challenges,
} = {}) {
  if (
    !admin ||
    admin.role !== "super_admin"
  ) {
    throw invalid(
      "REVIVAL_APPLY_SUPER_ADMIN_REQUIRED",
      403
    );
  }

  const actorAdminId =
    admin.id === undefined ||
    admin.id === null
      ? ""
      : String(admin.id).trim();

  if (!actorAdminId) {
    throw invalid(
      "REVIVAL_APPLY_ACTOR_REQUIRED",
      403
    );
  }

  if (
    typeof applyRequestId !== "string" ||
    !UUID_PATTERN.test(
      applyRequestId
    )
  ) {
    throw invalid(
      "REVIVAL_APPLY_REQUEST_ID_INVALID",
      400
    );
  }

  const normalized =
    compileRevivalAdminChallenges(
      challenges
    );

  return {
    apply_request_id:
      applyRequestId.toLowerCase(),

    actor_admin_id:
      actorAdminId,

    revival_challenges:
      normalized,
  };
}

module.exports = {
  prepareRevivalAdminApply,
};
