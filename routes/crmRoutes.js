const express =
  require("express");

const router =
  express.Router();

/**
 * =====================================================
 * CONTROLLERS
 * =====================================================
 */

const syncMemberController =
  require(
    "../controllers/crm/syncMemberController"
  );

const syncVoucherController =
  require(
    "../controllers/crm/syncVoucherController"
  );

const syncMenuController =
  require(
    "../controllers/crm/syncMenuController"
  );

const syncOrderController =
  require(
    "../controllers/crm/syncOrderController"
  );

/**
 * =====================================================
 * MEMBER CRM
 * =====================================================
 */

router.post(
  "/member/sync",
  syncMemberController
);

/**
 * =====================================================
 * VOUCHER CRM
 * =====================================================
 */

router.post(
  "/voucher/sync",
  syncVoucherController
);

/**
 * =====================================================
 * MENU CRM
 * =====================================================
 */

router.post(
  "/menu/sync",
  syncMenuController
);

/**
 * =====================================================
 * ORDER CRM
 * =====================================================
 */

router.post(
  "/order/sync",
  syncOrderController
);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;