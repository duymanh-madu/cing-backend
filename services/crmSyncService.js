const supabase =
  require("../supabase");

const {
  createNotification,
} = require(
  "./notificationService"
);

/**
 * ============================================
 * CALCULATE GAME PLAYS
 * ============================================
 */

function calculateGamePlays(
  total_amount
) {

  /**
   * 50K = 1 PLAY
   */

  return Math.floor(

    Number(
      total_amount || 0
    ) / 50000

  );

}

/**
 * ============================================
 * VIP ENGINE
 * ============================================
 */

function calculateVipLevel(
  totalSpent
) {

  const amount =
    Number(
      totalSpent || 0
    );

  if (
    amount >= 10000000
  ) {

    return "Kim Cương";

  }

  if (
    amount >= 5000000
  ) {

    return "Vàng";

  }

  if (
    amount >= 2000000
  ) {

    return "Bạc";

  }

  return "Thành Viên";

}

/**
 * ============================================
 * CRM PLAYER SYNC
 * ============================================
 */

async function syncCRMPlayer({

  user_id,

  name,

  phone,

  crm_member_code,

  crm_tier,

  total_amount,

}) {

  /**
   * ============================================
   * GET PLAYER
   * ============================================
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

  if (playerError) {

    throw new Error(
      playerError.message
    );

  }

  /**
   * ============================================
   * GAME PLAY BONUS
   * ============================================
   */

  const bonusPlays =
    calculateGamePlays(
      total_amount
    );

  /**
   * ============================================
   * TOTAL SPENT
   * ============================================
   */

  const newTotalSpent =

    Number(
      player
        ?.total_spent_all_time || 0
    ) +

    Number(
      total_amount || 0
    );

  /**
   * ============================================
   * VIP LEVEL
   * ============================================
   */

  const vipLevel =
    calculateVipLevel(
      newTotalSpent
    );

  /**
   * ============================================
   * TOTAL GAME PLAYS
   * ============================================
   */

  const totalGamePlays =

    Number(
      player?.game_plays || 0
    ) +

    bonusPlays;

  /**
   * ============================================
   * TOTAL ORDERS
   * ============================================
   */

  const totalOrders =

    Number(
      player?.total_orders || 0
    ) + 1;

  /**
   * ============================================
   * UPSERT PLAYER
   * ============================================
   */

  const {
    error: upsertError,
  } = await supabase

    .from("players")

    .upsert(

      {

        user_id,

        name,

        phone,

        crm_member_code,

        crm_tier,

        vip_level:
          vipLevel,

        total_spent_all_time:
          newTotalSpent,

        total_orders:
          totalOrders,

        game_plays:
          totalGamePlays,

        updated_at:
          new Date(),

      },

      {
        onConflict:
          "user_id",
      }

    );

  if (upsertError) {

    throw new Error(
      upsertError.message
    );

  }

  /**
   * ============================================
   * REWARD NOTIFICATION
   * ============================================
   */

  if (bonusPlays > 0) {

    await createNotification({

      user_id,

      title:
        "Bạn được tặng lượt chơi 🎉",

      message:

        `Đơn hàng ${Number(
          total_amount
        ).toLocaleString()}đ đã được cộng ${bonusPlays} lượt chơi.`,

      type:
        "reward",

      notification_type:
        "order_reward",

    });

  }

  /**
   * ============================================
   * VIP LEVEL-UP NOTIFICATION
   * ============================================
   */

  if (
    player?.vip_level &&
    player?.vip_level !==
      vipLevel
  ) {

    await createNotification({

      user_id,

      title:
        "Thăng hạng thành viên 👑",

      message:

        `Bạn đã lên hạng ${vipLevel}.`,

      type:
        "vip",

      notification_type:
        "level_up",

    });

  }

  /**
   * ============================================
   * RESULT
   * ============================================
   */

  return {

    success: true,

    vipLevel,

    bonusPlays,

    totalGamePlays,

    totalSpent:
      newTotalSpent,

    totalOrders,

  };

}

module.exports = {

  syncCRMPlayer,

};