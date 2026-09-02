"use strict";

const REMATCH_STATUS = Object.freeze({
  WAITING:
    "waiting",

  MATCHED:
    "matched",
});

function assertNonEmptyString(
  rawValue,
  code
) {
  const value =
    String(
      rawValue || ""
    ).trim();

  if (!value) {
    const error =
      new Error(code);

    error.code =
      code;

    error.statusCode =
      400;

    throw error;
  }

  return value;
}

function assertSourceMatchId(
  rawSourceMatchId
) {
  return assertNonEmptyString(
    rawSourceMatchId,
    "CING_ARTILLERY_REMATCH_SOURCE_MATCH_REQUIRED"
  );
}

function normalizeRematchHandshakeRecord(
  rawRecord
) {
  if (
    !rawRecord ||
    typeof rawRecord !==
      "object"
  ) {
    throw new Error(
      "CING_ARTILLERY_REMATCH_RESULT_INVALID"
    );
  }

  const sourceMatchId =
    assertNonEmptyString(
      rawRecord.source_match_id,
      "CING_ARTILLERY_REMATCH_RESULT_INVALID"
    );

  const status =
    String(
      rawRecord.handshake_status || ""
    ).trim();

  if (
    status !==
      REMATCH_STATUS.WAITING &&
    status !==
      REMATCH_STATUS.MATCHED
  ) {
    throw new Error(
      "CING_ARTILLERY_REMATCH_RESULT_INVALID"
    );
  }

  const playerOneAccepted =
    rawRecord.player_one_accepted ===
    true;

  const playerTwoAccepted =
    rawRecord.player_two_accepted ===
    true;

  if (
    status ===
    REMATCH_STATUS.WAITING
  ) {
    if (
      !playerOneAccepted &&
      !playerTwoAccepted
    ) {
      throw new Error(
        "CING_ARTILLERY_REMATCH_RESULT_INVALID"
      );
    }

    if (
      playerOneAccepted &&
      playerTwoAccepted
    ) {
      throw new Error(
        "CING_ARTILLERY_REMATCH_RESULT_INVALID"
      );
    }

    if (
      rawRecord.rematch_match_id != null ||
      rawRecord.player_one_session_id != null ||
      rawRecord.player_two_session_id != null ||
      rawRecord.matched_at != null
    ) {
      throw new Error(
        "CING_ARTILLERY_REMATCH_RESULT_INVALID"
      );
    }

    return Object.freeze({
      version:
        "cing-artillery-rematch-v1",

      source_match_id:
        sourceMatchId,

      status,

      player_one_accepted:
        playerOneAccepted,

      player_two_accepted:
        playerTwoAccepted,

      rematch_match_id:
        null,

      player_one_session_id:
        null,

      player_two_session_id:
        null,

      matched_at:
        null,

      runtime:
        null,
    });
  }

  if (
    !playerOneAccepted ||
    !playerTwoAccepted
  ) {
    throw new Error(
      "CING_ARTILLERY_REMATCH_RESULT_INVALID"
    );
  }

  const rematchMatchId =
    assertNonEmptyString(
      rawRecord.rematch_match_id,
      "CING_ARTILLERY_REMATCH_RESULT_INVALID"
    );

  const playerOneSessionId =
    assertNonEmptyString(
      rawRecord.player_one_session_id,
      "CING_ARTILLERY_REMATCH_RESULT_INVALID"
    );

  const playerTwoSessionId =
    assertNonEmptyString(
      rawRecord.player_two_session_id,
      "CING_ARTILLERY_REMATCH_RESULT_INVALID"
    );

  const matchedAt =
    assertNonEmptyString(
      rawRecord.matched_at,
      "CING_ARTILLERY_REMATCH_RESULT_INVALID"
    );

  return Object.freeze({
    version:
      "cing-artillery-rematch-v1",

    source_match_id:
      sourceMatchId,

    status,

    player_one_accepted:
      true,

    player_two_accepted:
      true,

    rematch_match_id:
      rematchMatchId,

    player_one_session_id:
      playerOneSessionId,

    player_two_session_id:
      playerTwoSessionId,

    matched_at:
      matchedAt,

    runtime:
      null,
  });
}

module.exports = {
  REMATCH_STATUS,
  assertSourceMatchId,
  normalizeRematchHandshakeRecord,
};
