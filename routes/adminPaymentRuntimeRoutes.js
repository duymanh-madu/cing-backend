const express =
  require("express");

const router =
  express.Router();

const adminAuthMiddleware =
  require("../middlewares/adminAuthMiddleware");

const {
  getPaymentRuntime,
} = require(
  "../controllers/admin/adminPaymentRuntimeController"
);

router.use(
  adminAuthMiddleware
);

router.get(
  "/",
  getPaymentRuntime
);

module.exports =
  router;