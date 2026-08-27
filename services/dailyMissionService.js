const supabase = require("../supabase");
const { realtimeEventBus } =
  require("./realtime/realtimeEventBus");

function todayVN() {
  return new Date().toLocaleDateString(
    "en-CA",
    {
      timeZone: "Asia/Ho_Chi_Minh",
    }
  );
}

let _missionCache = null;
let _missionCacheAt = 0;

async function getMissionConfigs() {
  if (
    _missionCache &&
    Date.now() - _missionCacheAt <
      5 * 60 * 1000
  ) {
    return _missionCache;
  }

  const {
    data,
    error,
  } = await supabase
    .from("mission_configs")
    .select("*")
    .eq("enabled", true)
    .order("created_at");

  if (error) {
    throw error;
  }

  _missionCache =
    data || [];
  _missionCacheAt =
    Date.now();

  return _missionCache;
}

function clearMissionCache() {
  _missionCache = null;
}

function normalizeRewardInteger(
  value,
  field
) {
  const n =
    Number(
      value ?? 0
    );

  if (
    !Number.isSafeInteger(n) ||
    n < 0
  ) {
    throw new Error(
      `MISSION_${field.toUpperCase()}_INVALID`
    );
  }

  return n;
}

function normalizeMissionReward(
  cfg
) {
  const plays =
    normalizeRewardInteger(
      cfg?.plays,
      "plays"
    );

  const points =
    normalizeRewardInteger(
      cfg?.points,
      "points"
    );

  if (
    plays === 0 &&
    points === 0
  ) {
    throw new Error(
      "MISSION_REWARD_EMPTY"
    );
  }

  return {
    plays,
    points,
  };
}

async function getDailyMissions(
  user_id
) {
  const today =
    todayVN();

  const configs =
    await getMissionConfigs();

  const {
    data,
    error,
  } = await supabase
    .from("daily_missions")
    .select("*")
    .eq(
      "user_id",
      user_id
    )
    .eq(
      "mission_date",
      today
    );

  if (error) {
    throw error;
  }

  return configs.map(
    cfg => {
      const done =
        data?.find(
          m =>
            m.mission_type ===
            cfg.type
        );

      return {
        type:
          cfg.type,

        label:
          cfg.label,

        description:
          cfg.description ||
          "",

        icon:
          cfg.icon ||
          "🎯",

        plays:
          Number(
            cfg.plays || 0
          ),

        points:
          Number(
            cfg.points || 0
          ),

        condition_type:
          cfg.condition_type,

        condition_value:
          cfg.condition_value,

        completed:
          !!done?.completed,

        completed_at:
          done?.completed_at ||
          null,

        plays_awarded:
          Number(
            done?.plays_awarded ||
            0
          ),

        points_awarded:
          Number(
            done?.points_awarded ||
            0
          ),
      };
    }
  );
}

async function completeMissionReward({
  user_id,
  mission_date,
  mission_type,
  plays,
  points,
  label,
}) {
  const {
    data,
    error,
  } = await supabase.rpc(
    "complete_daily_mission_atomic",
    {
      p_user_id:
        user_id,

      p_mission_date:
        mission_date,

      p_mission_type:
        mission_type,

      p_plays:
        plays,

      p_points:
        points,

      p_mission_label:
        label || null,
    }
  );

  if (error) {
    throw error;
  }

  const row =
    Array.isArray(data)
      ? data[0]
      : data;

  if (!row) {
    throw new Error(
      "DAILY_MISSION_AUTHORITY_EMPTY_RESULT"
    );
  }

  return {
    applied:
      row.applied === true,

    mission_id:
      row.mission_id,

    plays_awarded:
      Number(
        row.plays_awarded ||
        0
      ),

    points_awarded:
      Number(
        row.points_awarded ||
        0
      ),

    game_plays_after:
      Number(
        row.game_plays_after ||
        0
      ),

    total_points_after:
      Number(
        row.total_points_after ||
        0
      ),
  };
}

function pushMissionEvent(
  user_id,
  mission_type,
  result
) {
  try {
    realtimeEventBus.publish({
      event:
        "mission.completed",

      delivery_type:
        "BROADCAST",

      payload: {
        user_id,
        mission_type,

        plays_awarded:
          result.plays_awarded,

        points_awarded:
          result.points_awarded,

        game_plays_after:
          result.game_plays_after,

        total_points_after:
          result.total_points_after,
      },

      channel:
        "missions",

      timestamp:
        new Date().toISOString(),
    });
  } catch (e) {}
}

function rewardMessage({
  plays,
  points,
}) {
  const parts = [];

  if (plays > 0) {
    parts.push(
      `+${plays} lượt chơi`
    );
  }

  if (points > 0) {
    parts.push(
      `+${points} điểm tích luỹ`
    );
  }

  return parts.join(" và ");
}

async function doCheckin(
  user_id
) {
  const today =
    todayVN();

  const configs =
    await getMissionConfigs();

  const cfg =
    configs.find(
      c =>
        c.type ===
        "checkin"
    );

  if (!cfg) {
    throw new Error(
      "Nhiệm vụ điểm danh chưa được bật"
    );
  }

  const reward =
    normalizeMissionReward(
      cfg
    );

  const result =
    await completeMissionReward({
      user_id,
      mission_date:
        today,
      mission_type:
        "checkin",
      plays:
        reward.plays,
      points:
        reward.points,
      label:
        cfg.label ||
        "Điểm danh hàng ngày",
    });

  if (!result.applied) {
    return {
      success: true,
      already_checked_in:
        true,
      plays_awarded: 0,
      points_awarded: 0,
      message:
        "Bạn đã điểm danh hôm nay rồi!",
    };
  }

  pushMissionEvent(
    user_id,
    "checkin",
    result
  );

  return {
    success: true,
    plays_awarded:
      result.plays_awarded,
    points_awarded:
      result.points_awarded,
    game_plays_after:
      result.game_plays_after,
    total_points_after:
      result.total_points_after,
    message:
      `Điểm danh thành công! ${rewardMessage({
        plays:
          result.plays_awarded,
        points:
          result.points_awarded,
      })}`,
  };
}

async function checkOrderMissions(
  user_id,
  order_amount
) {
  const today =
    todayVN();

  const amount =
    Number(
      order_amount || 0
    );

  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    throw new Error(
      "MISSION_ORDER_AMOUNT_INVALID"
    );
  }

  const configs =
    await getMissionConfigs();

  const results = [];

  const orderMissions =
    configs.filter(
      cfg =>
        cfg.condition_type ===
          "order_amount" &&
        amount >=
          Number(
            cfg.condition_value ||
            0
          )
    );

  for (
    const cfg
    of orderMissions
  ) {
    const reward =
      normalizeMissionReward(
        cfg
      );

    const result =
      await completeMissionReward({
        user_id,
        mission_date:
          today,
        mission_type:
          cfg.type,
        plays:
          reward.plays,
        points:
          reward.points,
        label:
          cfg.label ||
          cfg.type,
      });

    if (!result.applied) {
      continue;
    }

    pushMissionEvent(
      user_id,
      cfg.type,
      result
    );

    results.push({
      type:
        cfg.type,

      plays:
        result.plays_awarded,

      points:
        result.points_awarded,

      game_plays_after:
        result.game_plays_after,

      total_points_after:
        result.total_points_after,
    });
  }

  return results;
}

async function completeManualMission({
  user_id,
  mission_type,
  config,
}) {
  const reward =
    normalizeMissionReward(
      config
    );

  const result =
    await completeMissionReward({
      user_id,
      mission_date:
        todayVN(),
      mission_type,
      plays:
        reward.plays,
      points:
        reward.points,
      label:
        config?.label ||
        mission_type,
    });

  if (result.applied) {
    pushMissionEvent(
      user_id,
      mission_type,
      result
    );
  }

  return result;
}

module.exports = {
  getDailyMissions,
  doCheckin,
  checkOrderMissions,
  completeManualMission,
  getMissionConfigs,
  clearMissionCache,
};
