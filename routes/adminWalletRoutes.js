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
  getPromotion,
  updatePromotion,
  getSummary,
} = require(
  "../controllers/admin/adminWalletController"
);

router.get(
  "/promotion",
  requirePermission(
    "wallet.promotion.read"
  ),
  getPromotion
);

router.put(
  "/promotion",
  requirePermission(
    "wallet.promotion.update"
  ),
  updatePromotion
);

router.get(
  "/summary",
  requirePermission(
    "wallet.reporting.read"
  ),
  getSummary
);

module.exports =
  router;
