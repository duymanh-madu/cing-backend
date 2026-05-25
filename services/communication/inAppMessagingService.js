const inAppMessages =
  [];

/**
 * =====================================================
 * PUSH IN-APP MESSAGE
 * =====================================================
 */

function pushInAppMessage({

  user_id,

  message_type,

  title,

  content,

}) {

  inAppMessages.unshift({

    user_id,

    message_type,

    title,

    content,

    read: false,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET USER MESSAGES
 * =====================================================
 */

function getUserMessages(
  user_id
) {

  return inAppMessages.filter(

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

  pushInAppMessage,

  getUserMessages,

};