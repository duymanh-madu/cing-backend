/**
 * =====================================================
 * REALTIME EVENT CONSTANTS
 * =====================================================
 */

const REALTIME_EVENTS = {

  /**
   * ===================================================
   * SOCKET
   * ===================================================
   */

  SOCKET_CONNECTED:
    "socket.connected",

  SOCKET_DISCONNECTED:
    "socket.disconnected",

  SOCKET_ERROR:
    "socket.error",

  /**
   * ===================================================
   * USER
   * ===================================================
   */

  USER_ONLINE:
    "user.online",

  USER_OFFLINE:
    "user.offline",

  USER_UPDATED:
    "user.updated",

  /**
   * ===================================================
   * NOTIFICATION
   * ===================================================
   */

  NOTIFICATION_CREATED:
    "notification.created",

  NOTIFICATION_SENT:
    "notification.sent",

  NOTIFICATION_READ:
    "notification.read",

  NOTIFICATION_NEW:
    "notification.new",

  NOTIFICATION_BROADCAST:
    "notification.broadcast",

  MEMBERSHIP_POINTS: "membership.points",
  MEMBERSHIP_UPDATED: "membership.updated",

  PAYMENT_SUCCESS: "payment.success",
  PAYMENT_FAILED:  "payment.failed",

  CHALLENGE_WON:
    "challenge.won",

  /**
   * ===================================================
   * VOUCHER
   * ===================================================
   */

  VOUCHER_CREATED:
    "voucher.created",

  VOUCHER_UPDATED:
    "voucher.updated",

  VOUCHER_CLAIMED:
    "voucher.claimed",

  /**
   * ===================================================
   * LEADERBOARD
   * ===================================================
   */

  LEADERBOARD_UPDATED:
    "leaderboard.updated",

  /**
   * ===================================================
   * GAME
   * ===================================================
   */

  GAME_SCORE_UPDATED:
    "game.score.updated",

  GAME_SESSION_STARTED:
    "game.session.started",

  GAME_SESSION_ENDED:
    "game.session.ended",

  /**
   * ===================================================
   * ORDER
   * ===================================================
   */

  ORDER_CREATED:
    "order.created",

  ORDER_UPDATED:
    "order.updated",

  ORDER_STATUS_CHANGED:
    "order.status.changed",
  PAYMENT_CREATED: "payment.created",
  PAYMENT_STATUS_UPDATED: "payment.status.updated",
  PAYMENT_PAID: "payment.paid",
  PAYMENT_FAILED: "payment.failed",
  MISSION_COMPLETED: "mission.completed",
  MISSIONS_CONFIG_UPDATED: "missions.config.updated",
  USER_UPDATED: "user.updated",
  

  /**
   * ===================================================
   * DELIVERY
   * ===================================================
   */

  DELIVERY_LOCATION_UPDATED:
    "delivery.location.updated",

  DELIVERY_STATUS_UPDATED:
    "delivery.status.updated",

  /**
   * ===================================================
   * CRM
   * ===================================================
   */

  CRM_SYNCED:
    "crm.synced",

  /**
   * ===================================================
   * ANALYTICS
   * ===================================================
   */

  ANALYTICS_UPDATED:
    "analytics.updated",

  /**
   * ===================================================
   * ADMIN
   * ===================================================
   */

  ADMIN_BROADCAST:
    "admin.broadcast",

};

/**
 * =====================================================
 * ROOM PREFIXES
 * =====================================================
 */

const ROOM_PREFIXES = {

  USER:
    "room:user:",

  ORDER:
    "room:order:",

  DELIVERY:
    "room:delivery:",

  CAMPAIGN:
    "room:campaign:",

  LEADERBOARD:
    "room:leaderboard:",

  GAME:
    "room:game:",

  ADMIN:
    "room:admin:",

};

/**
 * =====================================================
 * REDIS CHANNELS
 * =====================================================
 */

const REDIS_CHANNELS = {

  REALTIME_EVENTS:
    "realtime.events",

  SOCKET_EVENTS:
    "socket.events",

  ADMIN_EVENTS:
    "admin.events",

};

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  REALTIME_EVENTS,

  ROOM_PREFIXES,

  REDIS_CHANNELS,


  MENU_UPDATED:
    "menu.updated",

  MENU_CREATED:
    "menu.created",

  MENU_DELETED:
    "menu.deleted",
};