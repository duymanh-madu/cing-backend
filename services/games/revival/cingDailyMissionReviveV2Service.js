"use strict";

/*
 * CING GAME CENTER V2
 *
 * Dormant Daily Mission Revive Credit RPC bridge.
 *
 * This module is NOT mounted or called by
 * dailyMissionService.js yet.
 *
 * PostgreSQL owns:
 * - canonical mission completion;
 * - historical V1 replay fence;
 * - Revive Credit mutation;
 * - loyalty points;
 * - durable reward ledgers.
 */

const MAX_INTEGER = 2147483647;

function nonnegativeInteger(value, field) {
  if (
    typeof value !== "number" &&
    (
      typeof value !== "string" ||
      !/^\d+$/.test(value)
    )
  ) {
    throw new Error(
      `DAILY_MISSION_REVIVE_${field}_INVALID`
    );
  }

  const result = Number(value);

  if (
    !Number.isSafeInteger(result) ||
    result < 0 ||
    result > MAX_INTEGER
  ) {
    throw new Error(
      `DAILY_MISSION_REVIVE_${field}_INVALID`
    );
  }

  return result;
}

function requiredText(value, field) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `DAILY_MISSION_REVIVE_${field}_REQUIRED`
    );
  }

  return value.trim();
}

function projectDailyMissionReviveResult(data) {
  const row =
    Array.isArray(data)
      ? data[0]
      : data;

  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    typeof row.applied !== "boolean" ||
    typeof row.mission_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(row.mission_id)
  ) {
    throw new Error(
      "DAILY_MISSION_REVIVE_RESULT_INVALID"
    );
  }

  return {
    applied: row.applied,

    mission_id:
      row.mission_id,

    revive_credits_awarded:
      nonnegativeInteger(
        row.revive_credits_awarded,
        "CREDITS_AWARDED"
      ),

    points_awarded:
      nonnegativeInteger(
        row.points_awarded,
        "POINTS_AWARDED"
      ),

    revive_credit_balance_after:
      nonnegativeInteger(
        row.revive_credit_balance_after,
        "CREDIT_BALANCE"
      ),

    total_points_after:
      nonnegativeInteger(
        row.total_points_after,
        "POINT_BALANCE"
      ),
  };
}

async function completeDailyMissionReviveV2(
  {
    user_id,
    mission_date,
    mission_type,
    revive_credits,
    points,
    label,
  },
  injectedClient
) {
  const userId =
    requiredText(
      user_id,
      "USER_ID"
    );

  const missionDate =
    requiredText(
      mission_date,
      "DATE"
    );

  const missionType =
    requiredText(
      mission_type,
      "TYPE"
    );

  const credits =
    nonnegativeInteger(
      revive_credits,
      "CREDITS"
    );

  const loyaltyPoints =
    nonnegativeInteger(
      points,
      "POINTS"
    );

  if (
    credits === 0 &&
    loyaltyPoints === 0
  ) {
    throw new Error(
      "DAILY_MISSION_REVIVE_REWARD_EMPTY"
    );
  }

  const missionLabel =
    label == null
      ? null
      : requiredText(
          label,
          "LABEL"
        );

  /*
   * Load the real Supabase client only when
   * invoked without an injected test client.
   *
   * No connection or RPC at module import.
   */

  const client =
    injectedClient ||
    require("../../../supabase");

  const { data, error } =
    await client.rpc(
      "complete_daily_mission_revive_v2",
      {
        p_user_id:
          userId,

        p_mission_date:
          missionDate,

        p_mission_type:
          missionType,

        p_revive_credits:
          credits,

        p_points:
          loyaltyPoints,

        p_mission_label:
          missionLabel,
      }
    );

  if (error) {
    const wrapped = new Error(
      "DAILY_MISSION_REVIVE_AUTHORITY_FAILED"
    );

    wrapped.code =
      typeof error.code === "string"
        ? error.code
        : null;

    throw wrapped;
  }

  return projectDailyMissionReviveResult(
    data
  );
}

module.exports = {
  completeDailyMissionReviveV2,
  projectDailyMissionReviveResult,
};
