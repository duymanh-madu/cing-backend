const express = require("express");
const router = express.Router();

const metrics = require("../../services/observability/metricsEngine");
const trace = require("../../services/observability/traceEngine");
const health = require("../../services/observability/healthEngine");

// METRICS
router.get("/metrics", (req, res) => {
  res.json(metrics.get());
});

// TRACES
router.get("/traces", (req, res) => {
  res.json(trace.all());
});

// HEALTH
router.get("/health", (req, res) => {
  res.json(health.check({
    payment: true,
    crm: true,
    sync: true
  }));
});

module.exports = router;
