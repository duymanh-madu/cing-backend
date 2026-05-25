const notifications =
  [];

/**
 * =====================================================
 * CREATE SMART NOTIFICATION
 * =====================================================
 */

function createSmartNotification({

  user_id,

  type,

  title,

  message,

  metadata = {},

}) {

  notifications.unshift({

    user_id,

    type,

    title,

    message,

    metadata,

    delivered: false,

    opened: false,

    clicked: false,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET USER NOTIFICATIONS
 * =====================================================
 */

function getUserNotifications(
  user_id
) {

  return notifications.filter(

    (
      item
    ) =>

      item.user_id ===
      user_id

  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  createSmartNotification,

  getUserNotifications,

};