const supabase =
  require("../supabase");

const {
  createNotification,
} = require(
  "./notificationService"
);

const {
  trackEvent,
} = require(
  "./adminAnalyticsService"
);

const {
  broadcastDashboardUpdate,
} = require(
  "./adminRealtimeBroadcastService"
);

/**
 * ============================================
 * CREATE OR UPDATE MEMBER
 * ============================================
 */

async function createOrUpdateMember({

  zalo_user_id,

  zalo_name,

  zalo_avatar,

  phone_number,

  oa_followed = false,

  metadata = {},

}) {

  /**
   * VALIDATE
   */

  if (!zalo_user_id) {

    throw new Error(
      "Missing zalo_user_id"
    );

  }

  /**
   * FIND EXISTING
   */

  const {

    data: existing,

    error: existingError,

  } = await supabase

    .from("players")

    .select("*")

    .eq(
      "zalo_user_id",
      zalo_user_id
    )

    .maybeSingle();

  if (existingError) {

    throw new Error(
      existingError.message
    );

  }

  /**
   * MEMBER ACTIVATION LOGIC
   */

  const member_activated =

    Boolean(phone_number) &&
    Boolean(oa_followed);

  /**
   * UPDATE EXISTING
   */

  if (existing) {

    const {

      data: updated,

      error: updateError,

    } = await supabase

      .from("players")

      .update({

        zalo_name,

        zalo_avatar,

        phone_number:
          phone_number ||
          existing.phone_number,

        oa_followed,

        member_activated,

        last_login_at:
          new Date(),

        metadata: {

          ...(existing.metadata || {}),

          ...metadata,

        },

        updated_at:
          new Date(),

      })

      .eq(
        "id",
        existing.id
      )

      .select("*")

      .maybeSingle();

    if (updateError) {

      throw new Error(
        updateError.message
      );

    }

    /**
     * MEMBER ACTIVATED EVENT
     */

    if (

      member_activated &&

      !existing.member_activated

    ) {

      await handleMemberActivated({

        player: updated,

      });

    }

    return {

      success: true,

      is_new_member:
        false,

      player: updated,

    };

  }

  /**
   * CREATE MEMBER
   */

  const {

    data: created,

    error: createError,

  } = await supabase

    .from("players")

    .insert({

      zalo_user_id,

      zalo_name,

      zalo_avatar,

      phone_number,

      oa_followed,

      member_activated,

      exp: 0,

      total_spending: 0,

      vip_level: "bronze",

      metadata,

      created_at:
        new Date(),

      updated_at:
        new Date(),

      last_login_at:
        new Date(),

    })

    .select("*")

    .maybeSingle();

  if (createError) {

    throw new Error(
      createError.message
    );

  }

  /**
   * MEMBER ACTIVATED
   */

  if (member_activated) {

    await handleMemberActivated({

      player: created,

    });

  }

  return {

    success: true,

    is_new_member:
      true,

    player: created,

  };

}

/**
 * ============================================
 * HANDLE MEMBER ACTIVATED
 * ============================================
 */

async function handleMemberActivated({

  player,

}) {

  try {

    /**
     * NOTIFICATION
     */

    await createNotification({

      user_id:
        player.id,

      notification_type:
        "member_activated",

      type:
        "member_activated",

      title:
        "🎉 Kích hoạt thành viên thành công",

      message:
        "Bạn đã trở thành thành viên chính thức của Cing Hu Tang.",

      metadata: {

        player_id:
          player.id,

      },

    });

    /**
     * ANALYTICS
     */

    await trackEvent({

      event_type:
        "member_activated",

      user_id:
        player.id,

      event_data: {

        zalo_user_id:
          player.zalo_user_id,

        phone_number:
          player.phone_number,

      },

    });

    /**
     * DASHBOARD
     */

    await broadcastDashboardUpdate();

  } catch (error) {

    console.error(
      "handleMemberActivated error:",
      error.message
    );

  }

}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {

  createOrUpdateMember,

  handleMemberActivated,

};