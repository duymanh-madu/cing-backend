"use strict";

/*
 * CING GAME CENTER V2
 *
 * Eligibility only.
 *
 * This module:
 * - never awards points;
 * - never sends notifications;
 * - never creates daily challenges;
 * - never supplies fallback Admin targets;
 * - never reads live DB or app config;
 * - never finalizes a game session.
 *
 * The caller must provide:
 * - the persisted finalized score;
 * - the persisted finalized session;
 * - the explicitly enabled Admin config;
 * - the persisted daily challenge.
 *
 * Absence or inconsistency fails closed.
 */

const GAMES = new Set([
  "cing-stack-tower",
  "black-pearl-rush",
]);

function isNonnegativeInteger(value) {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 1000000
  );
}

function isPositiveInteger(value) {
  return (
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 1000000
  );
}

function vietnamDate(value) {
  if (typeof value !== "string" && !(value instanceof Date)) {
    return null;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).formatToParts(date);

  const find = type =>
    parts.find(part => part.type === type)?.value;

  const year = find("year");
  const month = find("month");
  const day = find("day");

  if (!year || !month || !day) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function ineligible(reason) {
  return {
    eligible: false,
    reason,
  };
}

/*
 * This is a candidate check, NOT a financial grant.
 *
 * A true result does not override PostgreSQL:
 * - challenge completed/winner authority;
 * - exactly-once reward authority;
 * - session/score identity authority.
 */


function evaluateOfflineReviveChallengeEligibility({
  score,
  session,
  challengeSnapshot,
  dailyChallenge,
} = {}) {
  /*
   * Eligibility is read-only.
   *
   * PostgreSQL Finalize must already
   * have committed the score, session
   * and challenge_snapshot_id.
   */

  if (
    !score ||
    !session ||
    !GAMES.has(score.game_key) ||
    score.offline_revive_session_id !== session.id ||
    session.game_key !== score.game_key ||
    session.user_id !== score.user_id ||
    session.status !== "finalized"
  ) {
    return ineligible("FINALIZED_SCORE_INVALID");
  }

  if (
    !isNonnegativeInteger(score.score) ||
    !isNonnegativeInteger(session.final_best_combo)
  ) {
    return ineligible("FINAL_RESULT_INVALID");
  }

  /*
   * V2 Finalize writes one PostgreSQL
   * timestamp into both score.played_at
   * and session.finalized_at.
   */

  const scoreTime =
    new Date(score.played_at).getTime();

  const finalizedTime =
    new Date(session.finalized_at).getTime();

  if (
    !Number.isFinite(scoreTime) ||
    !Number.isFinite(finalizedTime) ||
    scoreTime !== finalizedTime
  ) {
    return ineligible("FINALIZED_TIME_MISMATCH");
  }

  const challengeDate =
    vietnamDate(session.finalized_at);

  if (!challengeDate) {
    return ineligible("FINALIZED_DATE_INVALID");
  }

  /*
   * No current Admin config lookup.
   *
   * The snapshot must be exactly the
   * identity bound by PostgreSQL
   * during Finalize.
   */

  if (
    !challengeSnapshot ||
    typeof session.challenge_snapshot_id !== "string" ||
    !session.challenge_snapshot_id ||
    typeof challengeSnapshot.snapshot_id !== "string" ||
    challengeSnapshot.snapshot_id !==
      session.challenge_snapshot_id ||
    challengeSnapshot.game_key !== score.game_key ||
    challengeSnapshot.challenge_date !==
      challengeDate
  ) {
    return ineligible("BOUND_SNAPSHOT_INVALID");
  }

  /*
   * A missing or disabled snapshot
   * never falls back to combo 100,
   * combo 10 or a newer Admin config.
   */

  if (challengeSnapshot.enabled !== true) {
    return ineligible("BOUND_SNAPSHOT_DISABLED");
  }

  const appliedTime =
    new Date(
      challengeSnapshot.applied_at
    ).getTime();

  if (
    !Number.isFinite(appliedTime) ||
    appliedTime > finalizedTime
  ) {
    return ineligible("BOUND_SNAPSHOT_TIME_INVALID");
  }

  const type =
    challengeSnapshot.challenge_type;

  if (
    type !== "combo" &&
    type !== "score"
  ) {
    return ineligible("CHALLENGE_TYPE_UNSUPPORTED");
  }

  if (
    !isPositiveInteger(
      challengeSnapshot.target_value
    ) ||
    !isPositiveInteger(
      challengeSnapshot.reward_points
    )
  ) {
    return ineligible("BOUND_SNAPSHOT_VALUES_INVALID");
  }

  /*
   * A snapshot is not itself permission
   * to create a second winner.
   *
   * The canonical daily row still owns
   * challenge completion and reward
   * idempotency.
   */

  if (
    !dailyChallenge ||
    typeof dailyChallenge.id !== "string" ||
    !dailyChallenge.id ||
    challengeSnapshot.challenge_id !==
      dailyChallenge.id ||
    dailyChallenge.game_key !== score.game_key ||
    dailyChallenge.challenge_date !==
      challengeDate
  ) {
    return ineligible("DAILY_CHALLENGE_MISMATCH");
  }

  if (dailyChallenge.completed !== false) {
    return ineligible("CHALLENGE_ALREADY_COMPLETED");
  }

  const progress =
    type === "combo"
      ? session.final_best_combo
      : score.score;

  if (
    progress <
    challengeSnapshot.target_value
  ) {
    return ineligible("TARGET_NOT_REACHED");
  }

  return {
    eligible: true,
    reason: "TARGET_REACHED",
    snapshot_id:
      challengeSnapshot.snapshot_id,
    challenge_id: dailyChallenge.id,
    game_key: score.game_key,
    user_id: score.user_id,
    score_id: String(score.id),
    session_id: session.id,
    challenge_date: challengeDate,
    challenge_type: type,
    progress,
    target_value:
      challengeSnapshot.target_value,
    reward_points:
      challengeSnapshot.reward_points,
  };
}


module.exports = {
  evaluateOfflineReviveChallengeEligibility,
};
