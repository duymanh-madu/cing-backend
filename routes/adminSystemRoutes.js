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

  getSystemState,

  updateSystemRuntime,

  enableSystemFeature,

  disableSystemFeature,

  enableSystemMaintenance,

  disableSystemMaintenance,

} = require(
  "../controllers/admin/adminSystemController"
);

/**
 * =====================================================
 * SYSTEM STATE
 * =====================================================
 */

router.get(

  "/",

  requirePermission(
    "system.read"
  ),

  getSystemState

);

/**
 * =====================================================
 * UPDATE RUNTIME
 * =====================================================
 */

router.patch(

  "/runtime",

  requirePermission(
    "system.runtime.update"
  ),

  updateSystemRuntime

);

/**
 * =====================================================
 * ENABLE FEATURE
 * =====================================================
 */

router.post(

  "/features/:feature/enable",

  requirePermission(
    "system.feature.enable"
  ),

  enableSystemFeature

);

/**
 * =====================================================
 * DISABLE FEATURE
 * =====================================================
 */

router.post(

  "/features/:feature/disable",

  requirePermission(
    "system.feature.disable"
  ),

  disableSystemFeature

);

/**
 * =====================================================
 * ENABLE MAINTENANCE
 * =====================================================
 */

router.post(

  "/maintenance/enable",

  requirePermission(
    "system.maintenance.enable"
  ),

  enableSystemMaintenance

);

/**
 * =====================================================
 * DISABLE MAINTENANCE
 * =====================================================
 */

router.post(

  "/maintenance/disable",

  requirePermission(
    "system.maintenance.disable"
  ),

  disableSystemMaintenance

);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;