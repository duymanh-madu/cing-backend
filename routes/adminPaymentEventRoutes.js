const express =
  require("express");

const router =
  express.Router();

const adminAuthMiddleware =
  require("../middlewares/adminAuthMiddleware");

const {
  getPaymentEvents,
} = require(
  "../controllers/admin/adminPaymentEventController"
);

router.use(
  adminAuthMiddleware
);

router.get(
  "/",
  getPaymentEvents
);

module.exports =
  router;