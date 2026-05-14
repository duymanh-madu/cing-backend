const appEventBus =
  require(
    "../bus/appEventBus"
  );

/**
 * =====================================================
 * ORDER EVENTS
 * =====================================================
 */

require(
  "./handlers/orderCreatedHandler"
);

require(
  "./handlers/paymentSuccessHandler"
);

/**
 * =====================================================
 * MEMBER EVENTS
 * =====================================================
 */

require(
  "./member/memberActivatedEvent"
);

/**
 * =====================================================
 * VOUCHER EVENTS
 * =====================================================
 */

require(
  "./voucher/voucherUsedEvent"
);

/**
 * =====================================================
 * CRM EVENTS
 * =====================================================
 */

require(
  "./crm/crmSyncListener"
);

/**
 * =====================================================
 * REALTIME EVENTS
 * =====================================================
 */

require(
  "./realtime/realtimeListener"
);

/**
 * =====================================================
 * ANALYTICS EVENTS
 * =====================================================
 */

require(
  "./analytics/trackEventListener"
);

function registerEvents() {

  console.log(
    "✅ Event listeners registered"
  );

  return appEventBus;

}

module.exports = {

  registerEvents,

};