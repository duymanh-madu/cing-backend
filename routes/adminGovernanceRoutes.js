const express =
  require("express");

const router =
  express.Router();

const {

  requirePermission,

} = require(
  "../middlewares/adminAuthMiddleware"
);

const {

  getGovernanceState,

} = require(
  "../controllers/admin/adminGovernanceController"
);

/**
 * =====================================================
 * GOVERNANCE STATE
 * =====================================================
 */

router.get(

  "/",

  requirePermission(
    "system.governance.read"
  ),

  getGovernanceState

);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;