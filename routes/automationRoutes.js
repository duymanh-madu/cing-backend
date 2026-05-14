const express =
  require("express");

const router =
  express.Router();

/**
 * =====================================================
 * CONTROLLERS
 * =====================================================
 */

const expireVoucherController =
  require(
    "../controllers/automation/expireVoucherController"
  );

const crmRetryController =
  require(
    "../controllers/automation/crmRetryController"
  );

const notificationRetryController =
  require(
    "../controllers/automation/notificationRetryController"
  );

/**
 * =====================================================
 * VOUCHER AUTOMATION
 * =====================================================
 */

router.post(
  "/voucher/expire",
  expireVoucherController
);

/**
 * =====================================================
 * CRM RETRY
 * =====================================================
 */

router.post(
  "/crm/retry",
  crmRetryController
);

/**
 * =====================================================
 * NOTIFICATION RETRY
 * =====================================================
 */

router.post(
  "/notification/retry",
  notificationRetryController
);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;