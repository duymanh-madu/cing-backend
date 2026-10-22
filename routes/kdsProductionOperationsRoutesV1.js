"use strict";
const express = require("express");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../utils/jwtSecretAuthority");
const supabase = require("../supabase");
const { createKdsOperationsBridgeV1 } = require("../services/kds/cingKdsOperationsBridgeV1");
const handlers = createKdsOperationsBridgeV1({
  rpc:(name, args) => supabase.rpc(name, args),
  verifyToken:token => jwt.verify(token, JWT_SECRET)
});
const router = express.Router();
router.get("/branches", handlers.branches);
router.get("/snapshot", handlers.snapshot);
router.post("/cups/transition", express.json({limit:"8kb"}), handlers.transition);
router.put("/policy", express.json({limit:"8kb"}), handlers.policy);
module.exports = router;
