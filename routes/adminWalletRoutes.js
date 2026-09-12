const express =
  require("express");

const router =
  express.Router();

const {
  requirePanelPermission,
} = require(
  "../middlewares/adminPanelPermissionMiddleware"
);

const {
  getPromotion,
  updatePromotion,
  getSummary,
  getTransactions,
  createAdjustment,
  getAdjustmentCustomers,
} = require(
  "../controllers/admin/adminWalletController"
);

router.get(
  "/promotion",
  requirePanelPermission(
    "wallet.promotion.read"
  ),
  getPromotion
);

router.put(
  "/promotion",
  requirePanelPermission(
    "wallet.promotion.update"
  ),
  updatePromotion
);

router.get(
  "/customers",
  requirePanelPermission(
    "wallet.balance.adjust"
  ),
  getAdjustmentCustomers
);

router.post(
  "/adjustments",
  requirePanelPermission(
    "wallet.balance.adjust"
  ),
  createAdjustment
);

router.get(
  "/transactions",
  requirePanelPermission(
    "wallet.reporting.read"
  ),
  getTransactions
);

router.get(
  "/summary",
  requirePanelPermission(
    "wallet.reporting.read"
  ),
  getSummary
);

module.exports =
  router;
