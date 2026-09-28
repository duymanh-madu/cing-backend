"use strict";

const test = require("node:test");

const assert =
  require("node:assert/strict");

const {
  rewardMessage,
  completedReward,
  checkinResponse,
  orderMissionResult,
  realtimeMissionPayload,
  missionRewardSnapshot,
} = require(
  "../cingDailyMissionReviveV2Presentation"
);

const base = {
  applied: true,

  mission_id:
    "10000000-0000-4000-8000-000000000001",

  revive_credits_awarded:
    4,

  points_awarded:
    6,

  revive_credit_balance_after:
    14,

  total_points_after:
    56,
};

test(
  "message names Credit, not game plays",
  () => {
    const message =
      rewardMessage(base);

    assert.equal(
      message,
      "+4 Revive Credit và +6 điểm tích luỹ"
    );

    assert.doesNotMatch(
      message,
      /lượt chơi/
    );
  }
);

test(
  "points-only and Credit-only messages",
  () => {
    assert.equal(
      rewardMessage({
        ...base,
        revive_credits_awarded: 0,
      }),
      "+6 điểm tích luỹ"
    );

    assert.equal(
      rewardMessage({
        ...base,
        points_awarded: 0,
      }),
      "+4 Revive Credit"
    );
  }
);

test(
  "completed reward does not fabricate plays",
  () => {
    const result =
      completedReward(base);

    assert.equal(
      result.reward_currency,
      "revive_credit"
    );

    assert.equal(
      result.revive_credit_balance_after,
      14
    );

    assert.equal(
      "game_plays_after" in result,
      false
    );

    assert.equal(
      "plays_awarded" in result,
      false
    );
  }
);

test(
  "check-in success uses V2 contract",
  () => {
    const response =
      checkinResponse(base);

    assert.equal(
      response.success,
      true
    );

    assert.equal(
      response.already_checked_in,
      false
    );

    assert.equal(
      response.revive_credits_awarded,
      4
    );

    assert.match(
      response.message,
      /Revive Credit/
    );
  }
);

test(
  "replayed check-in does not advertise award",
  () => {
    const response =
      checkinResponse({
        ...base,
        applied: false,
      });

    assert.equal(
      response.already_checked_in,
      true
    );

    assert.equal(
      response.revive_credits_awarded,
      0
    );

    assert.equal(
      response.points_awarded,
      0
    );

    assert.doesNotMatch(
      response.message,
      /\+4|\+6/
    );
  }
);

test(
  "order mission preserves both currencies",
  () => {
    const result =
      orderMissionResult(
        "order_amount",
        base
      );

    assert.equal(
      result.type,
      "order_amount"
    );

    assert.equal(
      result.revive_credits_awarded,
      4
    );

    assert.equal(
      result.points_awarded,
      6
    );

    assert.equal(
      "plays" in result,
      false
    );
  }
);

test(
  "replayed order mission is excluded",
  () => {
    assert.equal(
      orderMissionResult(
        "order_amount",
        {
          ...base,
          applied: false,
        }
      ),
      null
    );
  }
);

test(
  "realtime publishes only new completion",
  () => {
    const payload =
      realtimeMissionPayload(
        "fixture-user",
        "checkin",
        base
      );

    assert.equal(
      payload.revive_credits_awarded,
      4
    );

    assert.equal(
      payload.total_points_after,
      56
    );

    assert.equal(
      "game_plays_after" in payload,
      false
    );

    assert.equal(
      realtimeMissionPayload(
        "fixture-user",
        "checkin",
        {
          ...base,
          applied: false,
        }
      ),
      null
    );
  }
);

test(
  "V1 historical mission keeps legacy identity",
  () => {
    assert.deepEqual(
      missionRewardSnapshot({
        plays_awarded: 3,
        points_awarded: 2,

        reward_snapshot: {
          plays: 3,
          points: 2,
        },
      }),

      {
        reward_currency:
          "legacy_game_play",

        revive_credits_awarded:
          0,

        plays_awarded:
          3,

        points_awarded:
          2,
      }
    );
  }
);

test(
  "V2 snapshot identifies Credit",
  () => {
    assert.deepEqual(
      missionRewardSnapshot({
        plays_awarded: 0,
        points_awarded: 6,

        reward_snapshot: {
          reward_version: 2,

          reward_currency:
            "revive_credit",

          revive_credits: 4,

          plays: 0,

          points: 6,
        },
      }),

      {
        reward_currency:
          "revive_credit",

        revive_credits_awarded:
          4,

        plays_awarded:
          0,

        points_awarded:
          6,
      }
    );
  }
);

test(
  "invalid presentation result rejected",
  () => {
    for (const value of [
      null,

      {},

      {
        ...base,
        applied: "true",
      },

      {
        ...base,
        revive_credits_awarded: -1,
      },

      {
        ...base,
        points_awarded: 1.5,
      },
    ]) {
      assert.throws(
        () =>
          completedReward(value),
        /DAILY_MISSION_PRESENTATION_RESULT_INVALID/
      );
    }
  }
);
