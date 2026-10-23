"use strict";
const express = require("express");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../utils/jwtSecretAuthority");
const supabase = require("../supabase");
const { createKdsOperationsBridgeV1 } = require("../services/kds/cingKdsOperationsBridgeV1");
const {notifyKdsChangedV1,subscribeKdsChangedV1}=require("../services/kds/cingKdsChangeEventsV1");
const {createKdsOperationsStreamV1}=require("../services/kds/cingKdsOperationsStreamV1");
const handlers = createKdsOperationsBridgeV1({
  rpc:(name, args) => supabase.rpc(name, args).abortSignal(AbortSignal.timeout(12000)),
  verifyToken:token => jwt.verify(token, JWT_SECRET),
  onChange:notifyKdsChangedV1
});
const router = express.Router();
router.get("/branches", handlers.branches);
router.get("/snapshot", handlers.snapshot);
router.get("/events",createKdsOperationsStreamV1({snapshot:handlers.readSnapshot,subscribe:subscribeKdsChangedV1}));
router.post("/cups/transition", express.json({limit:"8kb"}), handlers.transition);
router.put("/policy", express.json({limit:"8kb"}), handlers.policy);
router.get("/access/branches",handlers.accessBranches);
router.get("/access",handlers.accessList);
router.put("/access",express.json({limit:"8kb"}),handlers.accessSave);
module.exports = router;
