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

  getProviderConfig,

  updateProviderConfig,

  resetProviderCircuit,

} = require(
  "../controllers/admin/adminPaymentProviderController"
);

/**
 * =====================================================
 * GET CONFIG
 * =====================================================
 */

router.get(

  "/config",

  requirePermission(
    "payment.provider.read"
  ),

  getProviderConfig

);

/**
 * =====================================================
 * UPDATE CONFIG
 * =====================================================
 */

router.patch(

  "/config",

  requirePermission(
    "payment.provider.update"
  ),

  updateProviderConfig

);

/**
 * =====================================================
 * RESET CIRCUIT
 * =====================================================
 */

router.post(

  "/reset-circuit/:provider",

  requirePermission(
    "payment.provider.reset"
  ),

  resetProviderCircuit

);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;