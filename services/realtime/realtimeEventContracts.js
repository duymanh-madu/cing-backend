const crypto =
  require(
    "crypto"
  );

/**
 * =====================================================
 * REALTIME EVENT TYPES
 * =====================================================
 */

const REALTIME_EVENTS = {

  /**
   * ============================================
   * USER
   * ============================================
   */

  USER_PROFILE_UPDATED:
    "user.profile.updated",

  USER_LEVEL_UPDATED:
    "user.level.updated",

  USER_POINTS_UPDATED:
    "user.points.updated",

  USER_VOUCHER_UPDATED:
    "user.voucher.updated",

  USER_NOTIFICATION:
    "user.notification",

  /**
   * ============================================
   * ORDER
   * ============================================
   */

  ORDER_CREATED:
    "order.created",

  ORDER_UPDATED:
    "order.updated",

  ORDER_COMPLETED:
    "order.completed",

  ORDER_CANCELLED:
    "order.cancelled",

  /**
   * ============================================
   * DELIVERY
   * ============================================
   */

  DELIVERY_ASSIGNED:
    "delivery.assigned",

  DELIVERY_LOCATION_UPDATED:
    "delivery.location.updated",

  DELIVERY_COMPLETED:
    "delivery.completed",

  /**
   * ============================================
   * CAMPAIGN
   * ============================================
   */

  CAMPAIGN_STARTED:
    "campaign.started",

  CAMPAIGN_UPDATED:
    "campaign.updated",

  CAMPAIGN_STOPPED:
    "campaign.stopped",

  /**
   * ============================================
   * LEADERBOARD
   * ============================================
   */

  LEADERBOARD_UPDATED:
    "leaderboard.updated",

  /**
   * ============================================
   * SYSTEM
   * ============================================
   */

  SYSTEM_NOTIFICATION:
    "system.notification",

  SYSTEM_MAINTENANCE:
    "system.maintenance",

};

/**
 * =====================================================
 * CHANNELS
 * =====================================================
 */

const REALTIME_CHANNELS = {

  USER:
    "user",

  ADMIN:
    "admin",

  DELIVERY:
    "delivery",

  SYSTEM:
    "system",

  LEADERBOARD:
    "leaderboard",

  CAMPAIGN:
    "campaign",

};

/**
 * =====================================================
 * DELIVERY TYPES
 * =====================================================
 */

const DELIVERY_TYPES = {

  BROADCAST:
    "broadcast",

  ROOM:
    "room",

  SOCKET:
    "socket",

};

/**
 * =====================================================
 * PRIORITY
 * =====================================================
 */

const REALTIME_PRIORITIES = {

  LOW:
    "low",

  NORMAL:
    "normal",

  HIGH:
    "high",

  CRITICAL:
    "critical",

};

/**
 * =====================================================
 * CREATE REALTIME EVENT
 * =====================================================
 */

function createRealtimeEvent({

  event,

  channel,

  payload = {},

  deliveryType =
    DELIVERY_TYPES.BROADCAST,

  room = null,

  socketId = null,

  priority =
    REALTIME_PRIORITIES.NORMAL,

}) {

  return {

    id:
      crypto.randomUUID(),

    event,

    channel,

    payload,

    delivery_type:
      deliveryType,

    room,

    socket_id:
      socketId,

    priority,

    created_at:
      new Date()
        .toISOString(),

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  REALTIME_EVENTS,

  REALTIME_CHANNELS,

  DELIVERY_TYPES,

  REALTIME_PRIORITIES,

  createRealtimeEvent,

};