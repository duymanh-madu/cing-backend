const supabase =
  require("../supabase");

const {
  createNotification,
} = require(
  "./notificationService"
);

const {
  useGamePlay,
} = require(
  "./gameService"
);

/**
 * ============================================
 * GET ACTIVE REWARDS
 * ============================================
 */

async function getWheelRewards() {

  const {
    data,
    error,
  } = await supabase

    .from("wheel_rewards")

    .select("*")

    .eq(
      "active",
      true
    )

    .order(
      "sort_order",
      {
        ascending: true,
      }
    );

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data || [];

}

/**
 * ============================================
 * SPIN ENGINE
 * ============================================
 */

async function spinWheel(
  user_id
) {

  /**
   * USE GAME PLAY
   */

  await useGamePlay(
    user_id
  );

  /**
   * PLAYER
   */

  const {
    data: player,
    error: playerError,
  } = await supabase

    .from("players")

    .select("*")

    .eq(
      "user_id",
      user_id
    )

    .maybeSingle();

  if (
    playerError ||
    !player
  ) {

    throw new Error(
      "Không tìm thấy player"
    );

  }

  /**
   * REWARDS
   */

  const rewards =
    await getWheelRewards();

  if (
    rewards.length === 0
  ) {

    throw new Error(
      "Không có rewards"
    );

  }

  /**
   * ============================================
   * WEIGHTED RANDOM
   * ============================================
   */

  const totalProbability =

    rewards.reduce(

      (
        sum,
        reward
      ) => {

        return (

          sum +

          Number(
            reward.probability || 0
          )

        );

      },

      0
    );

  const randomValue =

    Math.random() *
    totalProbability;

  let currentProbability = 0;

  let reward =
    rewards[0];

  for (const item of rewards) {

    currentProbability +=

      Number(
        item.probability || 0
      );

    if (
      randomValue <=
      currentProbability
    ) {

      reward = item;

      break;

    }

  }

  /**
   * REWARD INDEX
   */

  const rewardIndex =

    rewards.findIndex(
      (item) =>
        item.id === reward.id
    );

  /**
   * ============================================
   * UPDATE COINS
   * ============================================
   */

  if (
    reward.reward_type ===
    "coins"
  ) {

    await supabase

      .from("players")

      .update({

        coins:

          Number(
            player.coins || 0
          ) +

          Number(
            reward.reward_value || 0
          ),

      })

      .eq(
        "user_id",
        user_id
      );

  }

  /**
   * ============================================
   * SAVE SCORE
   * ============================================
   */

  await supabase

    .from("game_scores")

    .insert({

      game_key:
        "lucky-wheel",

      user_id,

      player_name:
        player.name ||
        "Player",

      score:
        Number(
          reward.reward_value || 0
        ),

      metadata: {

        reward_title:
          reward.title,

      },

    });

  /**
   * ============================================
   * SAVE VOUCHER
   * ============================================
   */

  if (
    reward.reward_type ===
    "voucher"
  ) {

    await supabase

      .from(
        "user_vouchers"
      )

      .insert({

        user_id,

        voucher_id:
          reward.voucher_id ||

          null,

        voucher_title:
          reward.title,

        used: false,

      });

  }

  /**
   * ============================================
   * ANALYTICS
   * ============================================
   */

  await supabase

    .from(
      "analytics_events"
    )

    .insert({

      event_name:
        "spin_wheel",

      user_id,

      event_data: {

        reward:
          reward.title,

        reward_type:
          reward.reward_type,

        reward_value:
          reward.reward_value,

      },

    });

  /**
   * ============================================
   * AUTO NOTIFICATION
   * ============================================
   */

  await createNotification({

    user_id,

    title:
      "🎉 Quay thưởng thành công",

    message:
      `Bạn nhận được: ${reward.title}`,

    type:
      "wheel_reward",

    image:
      reward.image || null,

    action_url:
      "/wheel",

  });

  /**
   * ============================================
   * RETURN
   * ============================================
   */

  return {

    success: true,

    reward,

    rewardIndex,

  };

}

/**
 * ============================================
 * WHEEL TOP PLAYERS
 * ============================================
 */

async function getWheelTopPlayers() {

  const {
    data,
    error,
  } = await supabase

    .from("game_scores")

    .select("*")

    .eq(
      "game_key",
      "lucky-wheel"
    )

    .order(
      "score",
      {
        ascending: false,
      }
    )

    .limit(10);

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data || [];

}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {

  spinWheel,

  getWheelRewards,

  getWheelTopPlayers,

};