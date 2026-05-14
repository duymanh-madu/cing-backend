const EVENTS = {

  /**
   * =====================================================
   * AUTH
   * =====================================================
   */

  USER_LOGGED_IN:
    "USER_LOGGED_IN",

  MEMBER_ACTIVATED:
    "MEMBER_ACTIVATED",

  /**
   * =====================================================
   * ORDERS
   * =====================================================
   */

  ORDER_CREATED:
    "ORDER_CREATED",

  ORDER_UPDATED:
    "ORDER_UPDATED",

  ORDER_COMPLETED:
    "ORDER_COMPLETED",

  /**
   * =====================================================
   * PAYMENTS
   * =====================================================
   */

  PAYMENT_SUCCESS:
    "PAYMENT_SUCCESS",

  PAYMENT_FAILED:
    "PAYMENT_FAILED",

  /**
   * =====================================================
   * VOUCHERS
   * =====================================================
   */

  VOUCHER_CLAIMED:
    "VOUCHER_CLAIMED",

  VOUCHER_USED:
    "VOUCHER_USED",

  VOUCHER_EXPIRED:
    "VOUCHER_EXPIRED",

  /**
   * =====================================================
   * CRM
   * =====================================================
   */

  CRM_SYNC_SUCCESS:
    "CRM_SYNC_SUCCESS",

  CRM_SYNC_FAILED:
    "CRM_SYNC_FAILED",

  /**
   * =====================================================
   * NOTIFICATIONS
   * =====================================================
   */

  NOTIFICATION_CREATED:
    "NOTIFICATION_CREATED",

};

module.exports =
  EVENTS;