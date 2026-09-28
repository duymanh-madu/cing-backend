"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createRewardDeliveryProcessor,
} = require(
  "../workers/cingOfflineReviveRewardDeliveryWorker"
);

function fixture(overrides = {}) {
  const calls = [];

  const job = {
    score_id: "123",
    session_id: "session-a",
    user_id: "member-a",
    game_key: "black-pearl-rush",
    reward_worker_token: "token-a",
    reward_status: "processing",
    reward_applied: null,
    reward_challenge_id: null,
    reward_snapshot_id: null,
    reward_notification_status: null,
    ...overrides,
  };

  const repository = {
    async claim() {
      calls.push("claim");
      return job;
    },

    async renew() {
      calls.push("renew");
      return true;
    },

    async award() {
      calls.push("award");
      return {
        applied: true,
        winner_user_id: "member-a",
        winner_session_id: "session-a",
        challenge_id: "challenge-a",
        snapshot_id: "snapshot-a",
      };
    },

    async ack({ outcome, reason }) {
      calls.push("ack:" + outcome);
      return {
        accepted: true,
        outcome,
        reason,
      };
    },

    async fail() {
      calls.push("fail");
      return true;
    },
  };

  return {
    calls,
    job,
    repository,
  };
}

test("successful credit is ACKed once", async () => {
  const f = fixture();

  const result = await createRewardDeliveryProcessor({
    repository: f.repository,
  }).processOne();

  assert.equal(result.awarded, true);
  assert.equal(result.delivered, true);
  assert.equal(result.recovered, false);
  assert.equal(
    f.calls.filter(x => x === "award").length,
    1
  );
  assert.ok(f.calls.includes("ack:completed"));
  assert.ok(!f.calls.includes("fail"));
});

test("committed credit recovery never calls award again", async () => {
  const f = fixture({
    reward_applied: true,
    reward_challenge_id: "challenge-a",
    reward_snapshot_id: "snapshot-a",
    reward_notification_status: "pending",
  });

  const result = await createRewardDeliveryProcessor({
    repository: f.repository,
  }).processOne();

  assert.equal(result.recovered, true);
  assert.equal(result.delivered, true);
  assert.ok(!f.calls.includes("award"));
  assert.ok(f.calls.includes("ack:completed"));
});

test("disabled snapshot is skipped without credit", async () => {
  const f = fixture();

  f.repository.award = async () => {
    f.calls.push("award");
    throw Error(
      "REVIVAL_REWARD_SNAPSHOT_INELIGIBLE"
    );
  };

  const result = await createRewardDeliveryProcessor({
    repository: f.repository,
  }).processOne();

  assert.equal(result.awarded, false);
  assert.equal(result.delivered, true);
  assert.ok(f.calls.includes("ack:skipped"));
  assert.ok(!f.calls.includes("fail"));
});

test("temporary database error is retryable", async () => {
  const f = fixture();

  f.repository.award = async () => {
    f.calls.push("award");
    throw Error("DATABASE_TEMPORARILY_UNAVAILABLE");
  };

  const result = await createRewardDeliveryProcessor({
    repository: f.repository,
  }).processOne();

  assert.equal(result.delivered, false);
  assert.equal(result.failure_recorded, true);
  assert.ok(f.calls.includes("fail"));
  assert.ok(!f.calls.some(x => x.startsWith("ack:")));
});

test("same-user different-session winner is skipped", async () => {
  const f = fixture();

  f.repository.award = async () => ({
    applied: false,
    winner_user_id: "member-a",
    winner_session_id: "session-b",
    challenge_id: "challenge-a",
    snapshot_id: "snapshot-a",
  });

  const result = await createRewardDeliveryProcessor({
    repository: f.repository,
  }).processOne();

  assert.equal(result.delivered, true);
  assert.equal(result.awarded, false);
  assert.equal(result.reason, "OTHER_SESSION_WON");
  assert.ok(f.calls.includes("ack:skipped"));
  assert.ok(!f.calls.includes("fail"));
});

test("another member won: no winner notification", async () => {
  const f = fixture();

  f.repository.award = async () => ({
    applied: false,
    winner_user_id: "member-b",
    winner_session_id: "session-b",
    challenge_id: "challenge-a",
    snapshot_id: "snapshot-a",
  });

  const result = await createRewardDeliveryProcessor({
    repository: f.repository,
  }).processOne();

  assert.equal(result.delivered, true);
  assert.equal(result.awarded, false);
  assert.equal(result.reason, "OTHER_SESSION_WON");
  assert.ok(f.calls.includes("ack:skipped"));
  assert.ok(!f.calls.includes("fail"));
});

test("lost lease never produces successful ACK", async () => {
  const f = fixture();

  f.repository.renew = async () => {
    f.calls.push("renew");
    return false;
  };

  const result = await createRewardDeliveryProcessor({
    repository: f.repository,
  }).processOne();

  assert.equal(result.delivered, false);
  assert.ok(!f.calls.includes("award"));
  assert.ok(!f.calls.some(x => x.startsWith("ack:")));
});

test("empty claim performs no award or ACK", async () => {
  const f = fixture();

  f.repository.claim = async () => null;

  const result = await createRewardDeliveryProcessor({
    repository: f.repository,
  }).processOne();

  assert.deepEqual(result, {
    processed: false,
    reason: "empty",
  });
  assert.deepEqual(f.calls, []);
});


test("missing winner session provenance fails closed", async () => {
  const f = fixture();

  f.repository.award = async () => ({
    applied: false,
    winner_user_id: "member-a",
    winner_session_id: null,
    challenge_id: "challenge-a",
    snapshot_id: "snapshot-a",
  });

  const result = await createRewardDeliveryProcessor({
    repository: f.repository,
  }).processOne();

  assert.equal(result.delivered, false);
  assert.match(result.error, /WINNER_PROVENANCE_MISSING/);
  assert.ok(f.calls.includes("fail"));
  assert.ok(!f.calls.some(x => x.startsWith("ack:")));
});

test("own winning session with missing outbox credit fails closed", async () => {
  const f = fixture();

  f.repository.award = async () => ({
    applied: false,
    winner_user_id: "member-a",
    winner_session_id: "session-a",
    challenge_id: "challenge-a",
    snapshot_id: "snapshot-a",
  });

  const result = await createRewardDeliveryProcessor({
    repository: f.repository,
  }).processOne();

  assert.equal(result.delivered, false);
  assert.match(result.error, /OWN_SESSION_STATE_INCONSISTENT/);
  assert.ok(!f.calls.some(x => x.startsWith("ack:")));
});

test("successful award must belong to claimed session", async () => {
  const f = fixture();

  f.repository.award = async () => ({
    applied: true,
    winner_user_id: "member-a",
    winner_session_id: "session-b",
    challenge_id: "challenge-a",
    snapshot_id: "snapshot-a",
  });

  const result = await createRewardDeliveryProcessor({
    repository: f.repository,
  }).processOne();

  assert.equal(result.delivered, false);
  assert.match(result.error, /AWARD_IDENTITY_INVALID/);
  assert.ok(!f.calls.some(x => x.startsWith("ack:")));
});


test("numeric safe score ID is accepted", async () => {
  const f = fixture({ score_id: 123 });

  const result = await createRewardDeliveryProcessor({
    repository: f.repository,
  }).processOne();

  assert.equal(result.delivered, true);
  assert.ok(f.calls.includes("ack:completed"));
});

test("unsafe numeric score ID fails closed", async () => {
  const f = fixture({
    score_id: Number.MAX_SAFE_INTEGER + 1,
  });

  const result = await createRewardDeliveryProcessor({
    repository: f.repository,
  }).processOne();

  assert.equal(result.delivered, false);
  assert.match(result.error, /JOB_INVALID/);
  assert.ok(!f.calls.includes("award"));
  assert.ok(!f.calls.some(x => x.startsWith("ack:")));
});

test("invalid string score ID fails closed", async () => {
  const f = fixture({ score_id: "00123" });

  const result = await createRewardDeliveryProcessor({
    repository: f.repository,
  }).processOne();

  assert.equal(result.delivered, false);
  assert.match(result.error, /JOB_INVALID/);
  assert.ok(!f.calls.includes("award"));
  assert.ok(!f.calls.some(x => x.startsWith("ack:")));
});
