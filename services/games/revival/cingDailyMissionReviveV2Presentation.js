"use strict";

/*
 * CING GAME CENTER V2
 *
 * Dormant Daily Mission presentation contract.
 *
 * Input must come from the validated V2 RPC adapter.
 *
 * No Supabase client, financial mutation,
 * realtime publish, or active caller switch.
 */

function assertResult(result) {
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    typeof result.applied !== "boolean"
  ) {
    throw new Error(
      "DAILY_MISSION_PRESENTATION_RESULT_INVALID"
    );
  }

  for (const field of [
    "revive_credits_awarded",
    "points_awarded",
    "revive_credit_balance_after",
    "total_points_after",
  ]) {
    const value = result[field];

    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > 2147483647
    ) {
      throw new Error(
        "DAILY_MISSION_PRESENTATION_RESULT_INVALID"
      );
    }
  }

  return result;
}

function rewardMessage(result) {
  assertResult(result);

  const parts = [];

  if (
    result.revive_credits_awarded > 0
  ) {
    parts.push(
      `+${result.revive_credits_awarded} Revive Credit`
    );
  }

  if (
    result.points_awarded > 0
  ) {
    parts.push(
      `+${result.points_awarded} điểm tích luỹ`
    );
  }

  return parts.join(" và ");
}

function completedReward(result) {
  assertResult(result);

  /*
   * This is a V2 resource contract.
   *
   * Do not manufacture legacy plays_awarded
   * or game_plays_after fields.
   */

  return {
    reward_currency:
      "revive_credit",

    revive_credits_awarded:
      result.revive_credits_awarded,

    points_awarded:
      result.points_awarded,

    revive_credit_balance_after:
      result.revive_credit_balance_after,

    total_points_after:
      result.total_points_after,
  };
}

function checkinResponse(result) {
  assertResult(result);

  /*
   * Replay may return the historical reward
   * snapshot, but must not advertise it as
   * a newly granted reward.
   */

  if (!result.applied) {
    return {
      success: true,

      already_checked_in:
        true,

      reward_currency:
        "revive_credit",

      revive_credits_awarded:
        0,

      points_awarded:
        0,

      message:
        "Bạn đã điểm danh hôm nay rồi!",
    };
  }

  const message =
    rewardMessage(result);

  return {
    success: true,

    already_checked_in:
      false,

    ...completedReward(result),

    message:
      message
        ? `Điểm danh thành công! ${message}`
        : "Điểm danh thành công!",
  };
}

function orderMissionResult(
  missionType,
  result
) {
  assertResult(result);

  if (
    typeof missionType !== "string" ||
    !missionType.trim()
  ) {
    throw new Error(
      "DAILY_MISSION_PRESENTATION_TYPE_INVALID"
    );
  }

  if (!result.applied) {
    return null;
  }

  return {
    type:
      missionType.trim(),

    ...completedReward(result),
  };
}

function realtimeMissionPayload(
  userId,
  missionType,
  result
) {
  assertResult(result);

  if (
    !result.applied
  ) {
    return null;
  }

  if (
    typeof userId !== "string" ||
    !userId.trim() ||
    typeof missionType !== "string" ||
    !missionType.trim()
  ) {
    throw new Error(
      "DAILY_MISSION_PRESENTATION_IDENTITY_INVALID"
    );
  }

  return {
    user_id:
      userId.trim(),

    mission_type:
      missionType.trim(),

    mission_id:
      result.mission_id,

    ...completedReward(result),
  };
}

function missionRewardSnapshot(
  mission
) {
  if (
    !mission ||
    typeof mission !== "object"
  ) {
    throw new Error(
      "DAILY_MISSION_SNAPSHOT_INVALID"
    );
  }

  const snapshot =
    mission.reward_snapshot;

  /*
   * Never reinterpret historic V1
   * plays_awarded as V2 Revive Credit.
   */

  const isV2 =
    snapshot &&
    typeof snapshot === "object" &&
    snapshot.reward_currency ===
      "revive_credit" &&
    snapshot.reward_version === 2;

  return {
    reward_currency:
      isV2
        ? "revive_credit"
        : "legacy_game_play",

    revive_credits_awarded:
      isV2
        ? Number(
            snapshot.revive_credits ?? 0
          )
        : 0,

    plays_awarded:
      isV2
        ? 0
        : Number(
            mission.plays_awarded ?? 0
          ),

    points_awarded:
      Number(
        mission.points_awarded ?? 0
      ),
  };
}

module.exports = {
  rewardMessage,
  completedReward,
  checkinResponse,
  orderMissionResult,
  realtimeMissionPayload,
  missionRewardSnapshot,
};
