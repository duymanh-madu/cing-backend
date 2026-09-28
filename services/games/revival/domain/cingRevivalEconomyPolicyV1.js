"use strict";

/*
 * CING GAME CENTER V2
 * SHARED REVIVAL ECONOMY POLICY V1
 *
 * This module defines economic rules only.
 *
 * It does not:
 * - validate gameplay session ownership
 * - validate game-over eligibility
 * - mutate balances
 * - call Wallet
 * - submit leaderboard results
 *
 * PostgreSQL session authorities must independently
 * enforce these rules before consuming revive credits.
 */

const REVIVAL_GAME_KEYS = Object.freeze([
  "cing-block-puzzle",
  "cing-stack-tower",
  "black-pearl-rush",
]);

const MAX_REVIVES_PER_SESSION = 5;

const REVIVAL_COSTS = Object.freeze([
  1,
  2,
  4,
  8,
  16,
]);

const MAX_SESSION_REVIVAL_COST = 31;

class RevivalPolicyError extends Error {
  constructor(code) {
    super(code);
    this.name = "RevivalPolicyError";
    this.code = code;
  }
}

function assertRevivalGameKey(gameKey) {
  if (
    typeof gameKey !== "string" ||
    !REVIVAL_GAME_KEYS.includes(gameKey)
  ) {
    throw new RevivalPolicyError(
      "REVIVAL_GAME_NOT_SUPPORTED"
    );
  }

  return gameKey;
}

function assertRevivesUsed(revivesUsed) {
  if (
    !Number.isSafeInteger(revivesUsed) ||
    revivesUsed < 0 ||
    revivesUsed > MAX_REVIVES_PER_SESSION
  ) {
    throw new RevivalPolicyError(
      "REVIVAL_COUNT_INVALID"
    );
  }

  return revivesUsed;
}

function getNextRevivalCost({
  gameKey,
  revivesUsed,
}) {
  assertRevivalGameKey(gameKey);
  assertRevivesUsed(revivesUsed);

  if (revivesUsed === MAX_REVIVES_PER_SESSION) {
    throw new RevivalPolicyError(
      "REVIVAL_LIMIT_REACHED"
    );
  }

  return Object.freeze({
    game_key: gameKey,
    next_revive_index: revivesUsed + 1,
    credit_cost: REVIVAL_COSTS[revivesUsed],
    max_revives: MAX_REVIVES_PER_SESSION,
  });
}

function getConsumedRevivalCredits(revivesUsed) {
  assertRevivesUsed(revivesUsed);

  return REVIVAL_COSTS
    .slice(0, revivesUsed)
    .reduce((total, cost) => total + cost, 0);
}

module.exports = {
  REVIVAL_GAME_KEYS,
  REVIVAL_COSTS,
  MAX_REVIVES_PER_SESSION,
  MAX_SESSION_REVIVAL_COST,
  RevivalPolicyError,
  assertRevivalGameKey,
  assertRevivesUsed,
  getNextRevivalCost,
  getConsumedRevivalCredits,
};
