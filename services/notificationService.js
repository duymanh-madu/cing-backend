const supabase =
  require("../supabase");

const logger =
  require("./loggerService");

const {

  broadcastNotificationUpdate,

  broadcastDashboardUpdate,

} = require(
  "./adminRealtimeBroadcastService"
);

const {

  processRealtimeEvent,

} = require(
  "./realtime/realtimeEventPipeline"
);

const {

  MEMBER_EVENTS,

} = require(
  "./realtime/realtimeEventTypes"
);

/**
 * =====================================================
 * CREATE NOTIFICATION
 * =====================================================
 */

async function createNotification({

  user_id,

  title,

  message,

  type =
    "system",

  notification_type =
    "system",

  action_url = null,

  metadata = {},

  send_realtime = true,

}) {

  /**
   * ============================================
   * VALIDATION
   * ============================================
   */

  if (!title) {

    throw new Error(
      "Missing title"
    );

  }

  if (!message) {

    throw new Error(
      "Missing message"
    );

  }

  /**
   * ============================================
   * CREATE NOTIFICATION
   * ============================================
   */

  const {

    data,

    error,

  } = await supabase

    .from("notifications")

    .insert({

      user_id,

      title,

      message,

      type,

      notification_type,

      action_url,

      metadata,

      is_read: false,

      created_at:
        new Date(),

      updated_at:
        new Date(),

    })

    .select("*")

    .maybeSingle();

  /**
   * ============================================
   * DATABASE ERROR
   * ============================================
   */

  if (error) {

    logger.error(

      "Create notification failed",

      {

        error:
          error.message,

        user_id,

      }

    );

    throw new Error(
      error.message
    );

  }

  /**
   * ============================================
   * REALTIME MEMBER EVENT
   * ============================================
   */

  try {

    if (
      send_realtime &&
      user_id
    ) {

      processRealtimeEvent({

        type:
          "member",

        target:
          user_id,

        event:
          MEMBER_EVENTS.ORDER_UPDATED,

        payload: {

          notification:
            data,

        },

      });

    }

  } catch (realtimeError) {

    logger.error(

      "Notification realtime failed",

      {

        error:
          realtimeError.message,

        user_id,

      }

    );

  }

  /**
   * ============================================
   * ADMIN REALTIME
   * ============================================
   */

  try {

    await broadcastNotificationUpdate({

      notification:
        data,

      action:
        "notification_created",

    });

  } catch (adminError) {

    logger.error(

      "Admin notification broadcast failed",

      {

        error:
          adminError.message,

      }

    );

  }

  /**
   * ============================================
   * DASHBOARD REFRESH
   * ============================================
   */

  try {

    await broadcastDashboardUpdate();

  } catch (dashboardError) {

    logger.error(

      "Dashboard realtime refresh failed",

      {

        error:
          dashboardError.message,

      }

    );

  }

  /**
   * ============================================
   * SUCCESS LOG
   * ============================================
   */

  logger.info(

    "Notification created",

    {

      notification_id:
        data?.id,

      user_id,

      type,

      notification_type,

    }

  );

  /**
   * ============================================
   * RESPONSE
   * ============================================
   */

  return {

    success: true,

    notification:
      data,

  };

}

/**
 * =====================================================
 * MARK NOTIFICATION AS READ
 * =====================================================
 */

async function markNotificationRead({

  notification_id,

}) {

  /**
   * ============================================
   * UPDATE
   * ============================================
   */

  const {

    data,

    error,

  } = await supabase

    .from("notifications")

    .update({

      is_read: true,

      read_at:
        new Date(),

      updated_at:
        new Date(),

    })

    .eq(
      "id",
      notification_id
    )

    .select("*")

    .maybeSingle();

  /**
   * ============================================
   * DATABASE ERROR
   * ============================================
   */

  if (error) {

    logger.error(

      "Mark notification read failed",

      {

        error:
          error.message,

        notification_id,

      }

    );

    throw new Error(
      error.message
    );

  }

  /**
   * ============================================
   * SUCCESS LOG
   * ============================================
   */

  logger.info(

    "Notification marked as read",

    {

      notification_id,

    }

  );

  /**
   * ============================================
   * RESPONSE
   * ============================================
   */

  return {

    success: true,

    notification:
      data,

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  createNotification,

  markNotificationRead,

};