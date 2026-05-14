/**
 * =====================================================
 * MEMBER EVENTS
 * =====================================================
 */

const MEMBER_EVENTS = {

  POINT_UPDATED:
    "member:point_updated",

  LEVEL_UPDATED:
    "member:level_updated",

  VOUCHER_RECEIVED:
    "member:voucher_received",

  ORDER_UPDATED:
    "member:order_updated",

};

/**
 * =====================================================
 * ADMIN EVENTS
 * =====================================================
 */

const ADMIN_EVENTS = {

  DASHBOARD_UPDATED:
    "admin:dashboard_updated",

  ORDER_CREATED:
    "admin:order_created",

  MEMBER_UPDATED:
    "admin:member_updated",

};

/**
 * =====================================================
 * VOUCHER EVENTS
 * =====================================================
 */

const VOUCHER_EVENTS = {

  VOUCHER_CREATED:
    "voucher:created",

  VOUCHER_UPDATED:
    "voucher:updated",

};

/**
 * =====================================================
 * LEADERBOARD EVENTS
 * =====================================================
 */

const LEADERBOARD_EVENTS = {

  UPDATED:
    "leaderboard:updated",

};

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  MEMBER_EVENTS,

  ADMIN_EVENTS,

  VOUCHER_EVENTS,

  LEADERBOARD_EVENTS,

};