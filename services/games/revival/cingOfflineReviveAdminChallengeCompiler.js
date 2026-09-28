"use strict";

/*
 * CING GAME CENTER V2
 *
 * Compile Admin Daily Challenge configuration
 * into exactly two offline Revival game states.
 *
 * This module:
 * - does not grant points;
 * - does not write app_configs;
 * - does not write daily_challenges;
 * - does not write snapshots;
 * - does not authenticate Admin requests;
 * - does not choose an effective timestamp.
 *
 * Authentication and atomic persistence belong
 * to the subsequent Admin apply authority.
 */

const REVIVAL_GAME_KEYS = Object.freeze([
  "black-pearl-rush",
  "cing-stack-tower",
]);

const REVIVAL_SET = new Set(
  REVIVAL_GAME_KEYS
);

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 400;
  return error;
}

function positiveInteger(value) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 1000000
  );
}

function compileRevivalAdminChallenges(
  challenges
) {
  if (!Array.isArray(challenges)) {
    throw invalid(
      "REVIVAL_ADMIN_CHALLENGES_ARRAY_REQUIRED"
    );
  }

  const selected = new Map();

  for (const challenge of challenges) {
    if (
      !challenge ||
      typeof challenge !== "object" ||
      Array.isArray(challenge)
    ) {
      throw invalid(
        "REVIVAL_ADMIN_CHALLENGE_INVALID"
      );
    }

    const gameKey = challenge.game_key;

    /*
     * Chess and other non-Revival challenges
     * remain the responsibility of their
     * existing service.
     */

    if (!REVIVAL_SET.has(gameKey)) {
      continue;
    }

    if (selected.has(gameKey)) {
      throw invalid(
        "REVIVAL_ADMIN_DUPLICATE_GAME"
      );
    }

    if (
      typeof challenge.enabled !== "boolean"
    ) {
      throw invalid(
        "REVIVAL_ADMIN_ENABLED_REQUIRED"
      );
    }

    if (challenge.enabled === false) {
      selected.set(gameKey, {
        game_key: gameKey,
        enabled: false,
        challenge_type: null,
        target_value: null,
        reward_points: null,
      });

      continue;
    }

    if (
      challenge.challenge_type !== "combo" &&
      challenge.challenge_type !== "score"
    ) {
      throw invalid(
        "REVIVAL_ADMIN_CHALLENGE_TYPE_INVALID"
      );
    }

    if (
      !positiveInteger(
        challenge.target_value
      )
    ) {
      throw invalid(
        "REVIVAL_ADMIN_TARGET_INVALID"
      );
    }

    if (
      !positiveInteger(
        challenge.reward_points
      )
    ) {
      throw invalid(
        "REVIVAL_ADMIN_REWARD_INVALID"
      );
    }

    selected.set(gameKey, {
      game_key: gameKey,
      enabled: true,
      challenge_type:
        challenge.challenge_type,
      target_value:
        challenge.target_value,
      reward_points:
        challenge.reward_points,
    });
  }

  /*
   * A removed Revival game is disabled.
   * Returning both games prevents a removed
   * game from retaining an older enabled
   * snapshot as its latest state.
   */

  return REVIVAL_GAME_KEYS.map(
    gameKey =>
      selected.get(gameKey) || {
        game_key: gameKey,
        enabled: false,
        challenge_type: null,
        target_value: null,
        reward_points: null,
      }
  );
}

module.exports = {
  REVIVAL_GAME_KEYS,
  compileRevivalAdminChallenges,
};
