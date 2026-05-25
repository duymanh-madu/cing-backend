const deliveryRecoveryLogs =
  [];

/**
 * =====================================================
 * PROCESS DELIVERY FAILURE
 * =====================================================
 */

function processDeliveryFailure({

  order_id,

  reason,

  retry_assignment = true,

}) {

  const log = {

    order_id,

    reason,

    retry_assignment,

    created_at:
      Date.now(),

  };

  deliveryRecoveryLogs.unshift(
    log
  );

  return log;

}

/**
 * =====================================================
 * GET DELIVERY RECOVERY LOGS
 * =====================================================
 */

function getDeliveryRecoveryLogs() {

  return deliveryRecoveryLogs;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  processDeliveryFailure,

  getDeliveryRecoveryLogs,

};