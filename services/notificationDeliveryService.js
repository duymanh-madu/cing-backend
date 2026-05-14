const supabase =
  require("../supabase");

/**
 * ============================================
 * VALID DELIVERY STATUS
 * ============================================
 */

const DELIVERY_STATUS = {

  PENDING:
    "pending",

  PROCESSING:
    "processing",

  DELIVERED:
    "delivered",

  FAILED:
    "failed",

};

/**
 * ============================================
 * UPDATE STATUS
 * ============================================
 */

async function updateDeliveryStatus({

  notificationId,

  status,

  extraData = {},

}) {

  const {
    error,
  } = await supabase

    .from("notifications")

    .update({

      delivery_status:
        status,

      ...extraData,

    })

    .eq(
      "id",
      notificationId
    );

  if (error) {

    throw new Error(
      error.message
    );

  }

}

/**
 * ============================================
 * MARK PROCESSING
 * ============================================
 */

async function markProcessing(
  notificationId
) {

  await updateDeliveryStatus({

    notificationId,

    status:

      DELIVERY_STATUS
        .PROCESSING,

  });

}

/**
 * ============================================
 * MARK DELIVERED
 * ============================================
 */

async function markDelivered(
  notificationId
) {

  await updateDeliveryStatus({

    notificationId,

    status:

      DELIVERY_STATUS
        .DELIVERED,

    extraData: {

      delivered_at:
        new Date(),

    },

  });

}

/**
 * ============================================
 * MARK FAILED
 * ============================================
 */

async function markFailed(
  notificationId
) {

  /**
   * CURRENT
   */

  const {
    data: current,
    error: currentError,
  } = await supabase

    .from("notifications")

    .select("*")

    .eq(
      "id",
      notificationId
    )

    .maybeSingle();

  if (currentError) {

    throw new Error(
      currentError.message
    );

  }

  const retryCount =

    Number(
      current?.retry_count || 0
    ) + 1;

  /**
   * UPDATE
   */

  await updateDeliveryStatus({

    notificationId,

    status:

      DELIVERY_STATUS
        .FAILED,

    extraData: {

      retry_count:
        retryCount,

    },

  });

}

/**
 * ============================================
 * SHOULD RETRY
 * ============================================
 */

function shouldRetry(

  notification,

  maxRetry = 3

) {

  return (

    Number(
      notification?.retry_count || 0
    ) < maxRetry

  );

}

/**
 * ============================================
 * IS USER ONLINE
 * ============================================
 */

function isUserOnline(
  user_id
) {

  return global.onlineUsers?.has(
    user_id
  );

}

/**
 * ============================================
 * EMIT REALTIME
 * ============================================
 */

async function emitRealtimeNotification({

  io,

  notification,

}) {

  try {

    if (
      !io ||
      !notification
    ) {

      return false;

    }

    /**
     * ONLINE CHECK
     */

    const online =
      isUserOnline(
        notification.user_id
      );

    /**
     * OFFLINE
     */

    if (!online) {

      console.log(

        `⚠️ User offline: ${notification.user_id}`

      );

      return false;

    }

    /**
     * ROOM
     */

    const room =

      `user:${notification.user_id}`;

    /**
     * EMIT
     */

    io.to(room).emit(

      "notification",

      notification

    );

    console.log(

      `📨 Notification emitted to ${room}`

    );

    return true;

  } catch (error) {

    console.error(

      "Realtime emit failed:",

      error.message

    );

    return false;

  }

}

/**
 * ============================================
 * DELIVERY PIPELINE
 * ============================================
 */

async function processNotificationDelivery({

  io,

  notification,

}) {

  try {

    /**
     * PROCESSING
     */

    await markProcessing(
      notification.id
    );

    /**
     * REALTIME
     */

    const emitted =
      await emitRealtimeNotification({

        io,

        notification,

      });

    /**
     * IMPORTANT
     *
     * KHÔNG mark delivered ở đây
     * Vì client chưa ACK
     */

    if (!emitted) {

      await markFailed(
        notification.id
      );

      return false;

    }

    return true;

  } catch (error) {

    console.error(

      "Delivery pipeline failed:",

      error.message

    );

    await markFailed(
      notification.id
    );

    return false;

  }

}

module.exports = {

  DELIVERY_STATUS,

  markProcessing,

  markDelivered,

  markFailed,

  shouldRetry,

  isUserOnline,

  emitRealtimeNotification,

  processNotificationDelivery,

};