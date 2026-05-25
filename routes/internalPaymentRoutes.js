const express =
  require("express");

const router =
  express.Router();

const {
  getMetrics,
} = require(
  "../controllers/internal/paymentMetricsController"
);

router.get(
  "/metrics",
  getMetrics
);

module.exports =
  router;