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
