"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createNotificationProcessor,
} = require("../workers/cingOfflineReviveRewardNotificationWorker");

function fixture({ existing = false } = {}) {
  const calls = [];
  const job = {
    score_id: "123",
    session_id: "session-a",
    user_id: "member-a",
    reward_status: "completed",
    reward_applied: true,
    reward_challenge_id: "challenge-a",
    reward_snapshot_id: "snapshot-a",
    reward_notification_status: "processing",
    reward_notification_worker_token: "token-a",
  };

  const notification = {
    id: "456",
    user_id: "member-a",
    title: "Nhận thưởng thử thách ngày",
    message: "Bạn nhận được +29 điểm.",
    type: "daily_challenge_reward",
    source_event: "cing_offline_revive_daily_reward",
    metadata: {
      daily_challenge_id: "challenge-a",
      revival_session_id: "session-a",
      revival_score_id: 123,
      challenge_snapshot_id: "snapshot-a",
    },
    data: {
      reward_points: 29,
      game_key: "black-pearl-rush",
    },
    created_at: "2026-09-23T16:00:00Z",
  };

  const repository = {
    async claim() {
      calls.push("claim");
      return job;
    },
    async create() {
      calls.push("create");
      return {
        notification_id: "456",
        created: !existing,
      };
    },
    async getNotification() {
      calls.push("read");
      return notification;
    },
    async ack() {
      calls.push("ack");
      return true;
    },
    async fail() {
      calls.push("fail");
      return true;
    },
  };

  const publish = async event => {
    calls.push("publish");
    assert.equal(event.payload.notification.id, "456");
    assert.equal(event.payload.notification.source_event, "cing_offline_revive_daily_reward");
    assert.equal(event.payload.popup.notification_id, "456");
    assert.equal(event.payload.popup.reward_points, 29);
    assert.equal(
      event.payload.notification.created_at,
      notification.created_at
    );
  };

  return { calls, repository, publish };
}

test("first delivery creates and publishes persisted notification", async () => {
  const f = fixture();
  const result = await createNotificationProcessor(f).processOne();

  assert.equal(result.delivered, true);
  assert.equal(result.recovered, false);
  assert.deepEqual(f.calls, [
    "claim", "create", "read", "publish", "ack",
  ]);
});

test("retry reuses notification ID instead of creating another identity", async () => {
  const f = fixture({ existing: true });
  const result = await createNotificationProcessor(f).processOne();

  assert.equal(result.delivered, true);
  assert.equal(result.recovered, true);
  assert.equal(result.notification_id, "456");
  assert.deepEqual(f.calls, [
    "claim", "create", "read", "publish", "ack",
  ]);
});


test("publish failure does not ACK", async () => {
  const f = fixture({ existing: true });
  f.publish = async () => {
    f.calls.push("publish");
    throw Error("REALTIME_UNAVAILABLE");
  };

  const result = await createNotificationProcessor(f).processOne();

  assert.equal(result.delivered, false);
  assert.equal(result.failure_recorded, true);
  assert.match(result.error, /REALTIME_UNAVAILABLE/);
  assert.deepEqual(f.calls, [
    "claim", "create", "read", "publish", "fail",
  ]);
});

test("ACK failure after publish preserves retry path", async () => {
  const f = fixture({ existing: true });
  f.repository.ack = async () => {
    f.calls.push("ack");
    throw Error("ACK_CONNECTION_LOST");
  };

  const result = await createNotificationProcessor(f).processOne();

  assert.equal(result.delivered, false);
  assert.equal(result.failure_recorded, true);
  assert.match(result.error, /ACK_CONNECTION_LOST/);
  assert.deepEqual(f.calls, [
    "claim", "create", "read", "publish", "ack", "fail",
  ]);
});

test("wrong persisted recipient never publishes", async () => {
  const f = fixture();
  const original = f.repository.getNotification;

  f.repository.getNotification = async () => ({
    ...(await original()),
    user_id: "another-member",
  });

  const result = await createNotificationProcessor(f).processOne();

  assert.equal(result.delivered, false);
  assert.match(result.error, /IDENTITY_INVALID/);
  assert.ok(f.calls.includes("fail"));
  assert.ok(!f.calls.includes("publish"));
  assert.ok(!f.calls.includes("ack"));
});

test("empty notification claim performs no delivery", async () => {
  const f = fixture();
  f.repository.claim = async () => null;

  const result = await createNotificationProcessor(f).processOne();

  assert.deepEqual(result, {
    processed: false,
    reason: "empty",
  });
  assert.deepEqual(f.calls, []);
});


test("publish returning false does not ACK", async () => {
  const f = fixture({ existing: true });

  f.publish = async () => {
    f.calls.push("publish");
    return false;
  };

  const result =
    await createNotificationProcessor(f).processOne();

  assert.equal(result.delivered, false);
  assert.equal(result.failure_recorded, true);
  assert.match(result.error, /REALTIME_DISPATCH_FAILED/);

  assert.deepEqual(f.calls, [
    "claim", "create", "read", "publish", "fail",
  ]);
});
