"use strict";

/*
 * CING GAME CENTER V2
 * LEGACY GAME PLAYS MUTATION ENTRY GUARD V1
 *
 * Default OFF.
 *
 * This guards new requests at selected V1 HTTP endpoints.
 * It does NOT close the PostgreSQL writer fence.
 * It does NOT modify pending Commerce/CRM/iPOS effects.
 * It does NOT perform historical conversion.
 *
 * Financial cutover must be authorized separately.
 */

const FLAG =
  "CING_GAME_V2_LEGACY_MUTATIONS_DISABLED";

function isLegacyGamePlaysMutationDisabled() {
  return process.env[FLAG] === "true";
}

function sendLegacyGamePlaysClosed(res) {
  return res.status(410).json({
    success: false,
    code: "CING_LEGACY_GAME_PLAYS_CLOSED",
    message:
      "Chức năng lượt chơi cũ đã ngừng tiếp nhận giao dịch mới",
  });
}

function rejectLegacyGamePlaysMutation(req, res) {
  if (!isLegacyGamePlaysMutationDisabled()) {
    return false;
  }

  sendLegacyGamePlaysClosed(res);
  return true;
}

module.exports = {
  isLegacyGamePlaysMutationDisabled,
  sendLegacyGamePlaysClosed,
  rejectLegacyGamePlaysMutation,
};
