"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateOfflineReviveChallengeEligibility,
} = require(
  "../cingOfflineReviveChallengeEligibility"
);

const score = {
  id: "101",
  offline_revive_session_id: "session-1",
  game_key: "black-pearl-rush",
  user_id: "0912345678",
  score: 125,
  played_at: "2026-09-22T17:30:00.000Z",
};

const session = {
  id: "session-1",
  game_key: "black-pearl-rush",
  user_id: "0912345678",
  status: "finalized",
  finalized_at: "2026-09-22T17:30:00.000Z",
  challenge_snapshot_id: "snapshot-1",
  final_best_combo: 75,
};

const challengeSnapshot = {
  snapshot_id: "snapshot-1",
  challenge_id: "challenge-1",
  game_key: "black-pearl-rush",
  challenge_date: "2026-09-23",
  applied_at: "2026-09-22T17:00:00.000Z",
  enabled: true,
  challenge_type: "combo",
  target_value: 50,
  reward_points: 29,
};

const dailyChallenge = {
  id: "challenge-1",
  game_key: "black-pearl-rush",
  challenge_date: "2026-09-23",
  challenge_type: "combo",
  target_value: 50,
  reward_points: 29,
  completed: false,
};

function evaluate(overrides = {}) {
  return evaluateOfflineReviveChallengeEligibility({
    score,
    session,
    challengeSnapshot,
    dailyChallenge,
    ...overrides,
  });
}

test("finalized combo qualifies against bound snapshot", () => {
  const result = evaluate();

  assert.equal(result.eligible, true);
  assert.equal(result.snapshot_id, "snapshot-1");
  assert.equal(result.progress, 75);
  assert.equal(result.target_value, 50);
  assert.equal(result.reward_points, 29);
  assert.equal(result.challenge_date, "2026-09-23");
});

test("missing snapshot fails closed", () => {
  assert.equal(
    evaluate({
      challengeSnapshot: null,
    }).reason,
    "BOUND_SNAPSHOT_INVALID"
  );
});

test("missing session snapshot ID fails closed", () => {
  assert.equal(
    evaluate({
      session: {
        ...session,
        challenge_snapshot_id: null,
      },
    }).reason,
    "BOUND_SNAPSHOT_INVALID"
  );
});

test("different snapshot ID is rejected", () => {
  assert.equal(
    evaluate({
      challengeSnapshot: {
        ...challengeSnapshot,
        snapshot_id: "snapshot-other",
      },
    }).reason,
    "BOUND_SNAPSHOT_INVALID"
  );
});

test("disabled bound snapshot cannot award", () => {
  assert.equal(
    evaluate({
      challengeSnapshot: {
        ...challengeSnapshot,
        enabled: false,
      },
    }).reason,
    "BOUND_SNAPSHOT_DISABLED"
  );
});

test("no fallback to combo 100", () => {
  assert.equal(
    evaluate({
      challengeSnapshot: null,
      dailyChallenge: {
        ...dailyChallenge,
        target_value: 100,
      },
    }).eligible,
    false
  );
});

test("unfinalized session is rejected", () => {
  assert.equal(
    evaluate({
      session: {
        ...session,
        status: "revive_pending",
      },
    }).reason,
    "FINALIZED_SCORE_INVALID"
  );
});

test("score and session identity must match", () => {
  assert.equal(
    evaluate({
      session: {
        ...session,
        user_id: "0999999999",
      },
    }).eligible,
    false
  );
});

test("score and session timestamps must match", () => {
  assert.equal(
    evaluate({
      score: {
        ...score,
        played_at: "2026-09-22T17:31:00.000Z",
      },
    }).reason,
    "FINALIZED_TIME_MISMATCH"
  );
});

test("future snapshot cannot bind earlier Finalize", () => {
  assert.equal(
    evaluate({
      challengeSnapshot: {
        ...challengeSnapshot,
        applied_at: "2026-09-22T17:31:00.000Z",
      },
    }).reason,
    "BOUND_SNAPSHOT_TIME_INVALID"
  );
});

test("wrong snapshot game is rejected", () => {
  assert.equal(
    evaluate({
      challengeSnapshot: {
        ...challengeSnapshot,
        game_key: "cing-stack-tower",
      },
    }).reason,
    "BOUND_SNAPSHOT_INVALID"
  );
});

test("wrong Vietnam date is rejected", () => {
  assert.equal(
    evaluate({
      challengeSnapshot: {
        ...challengeSnapshot,
        challenge_date: "2026-09-22",
      },
    }).reason,
    "BOUND_SNAPSHOT_INVALID"
  );
});

test("combo uses session best combo", () => {
  assert.equal(
    evaluate({
      session: {
        ...session,
        final_best_combo: 49,
      },
    }).reason,
    "TARGET_NOT_REACHED"
  );
});

test("score challenge uses finalized score", () => {
  const result = evaluate({
    challengeSnapshot: {
      ...challengeSnapshot,
      challenge_type: "score",
      target_value: 120,
    },
    dailyChallenge: {
      ...dailyChallenge,
      challenge_type: "score",
      target_value: 120,
    },
  });

  assert.equal(result.eligible, true);
  assert.equal(result.progress, 125);
});

test("score below snapshot target gets nothing", () => {
  assert.equal(
    evaluate({
      challengeSnapshot: {
        ...challengeSnapshot,
        challenge_type: "score",
        target_value: 126,
      },
      dailyChallenge: {
        ...dailyChallenge,
        challenge_type: "score",
        target_value: 126,
      },
    }).reason,
    "TARGET_NOT_REACHED"
  );
});

test("different canonical challenge ID fails", () => {
  assert.equal(
    evaluate({
      dailyChallenge: {
        ...dailyChallenge,
        id: "challenge-other",
      },
    }).reason,
    "DAILY_CHALLENGE_MISMATCH"
  );
});

test("completed challenge is ineligible", () => {
  assert.equal(
    evaluate({
      dailyChallenge: {
        ...dailyChallenge,
        completed: true,
      },
    }).reason,
    "CHALLENGE_ALREADY_COMPLETED"
  );
});

test("later Admin target does not rewrite bound snapshot", () => {
  const result = evaluate({
    dailyChallenge: {
      ...dailyChallenge,
      target_value: 100,
    },
  });

  assert.equal(result.eligible, true);
  assert.equal(result.target_value, 50);
  assert.equal(result.progress, 75);
});

test("later Admin reward does not rewrite bound snapshot", () => {
  const result = evaluate({
    dailyChallenge: {
      ...dailyChallenge,
      reward_points: 50,
    },
  });

  assert.equal(result.eligible, true);
  assert.equal(result.reward_points, 29);
});

test("zero score does not create reward", () => {
  assert.equal(
    evaluate({
      score: {
        ...score,
        score: 0,
      },
      session: {
        ...session,
        final_best_combo: 0,
      },
    }).reason,
    "TARGET_NOT_REACHED"
  );
});

test("unsupported challenge type is rejected", () => {
  assert.equal(
    evaluate({
      challengeSnapshot: {
        ...challengeSnapshot,
        challenge_type: "wins",
      },
    }).reason,
    "CHALLENGE_TYPE_UNSUPPORTED"
  );
});

test("invalid snapshot reward is rejected", () => {
  assert.equal(
    evaluate({
      challengeSnapshot: {
        ...challengeSnapshot,
        reward_points: 0,
      },
    }).reason,
    "BOUND_SNAPSHOT_VALUES_INVALID"
  );
});

test("pure evaluation mutates no input", () => {
  const before = JSON.stringify({
    score,
    session,
    challengeSnapshot,
    dailyChallenge,
  });

  evaluate();

  assert.equal(
    JSON.stringify({
      score,
      session,
      challengeSnapshot,
      dailyChallenge,
    }),
    before
  );
});
