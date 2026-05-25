/**
 * =====================================================
 * DOMAIN EVENT TYPES
 * =====================================================
 */

const DOMAIN_EVENT_TYPES = {

  /**
   * PAYMENT
   */

  PAYMENT_CREATED:
    "payment.created",

  PAYMENT_PAID:
    "payment.paid",

  PAYMENT_FAILED:
    "payment.failed",

  PAYMENT_EXPIRED:
    "payment.expired",

  /**
   * ORDER
   */

  ORDER_CREATED:
    "order.created",

  ORDER_UPDATED:
    "order.updated",

  /**
   * GAME
   */

  GAME_STARTED:
    "game.started",

  GAME_FINISHED:
    "game.finished",

  /**
   * CAMPAIGN
   */

  CAMPAIGN_STARTED:
    "campaign.started",

  CAMPAIGN_FINISHED:
    "campaign.finished",

  /**
   * CRM
   */

  CUSTOMER_CREATED:
    "customer.created",

  CUSTOMER_UPDATED:
    "customer.updated",

  /**
   * NOTIFICATION
   */

  NOTIFICATION_SENT:
    "notification.sent",

  /**
   * RUNTIME
   */

  RUNTIME_UPDATED:
    "runtime.updated",

};

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  DOMAIN_EVENT_TYPES;