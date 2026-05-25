const express = require("express");
const router = express.Router();

const syncGateway = require("../../services/sync/syncGateway");

router.post("/ipos", async (req, res) => {

  const result = await syncGateway.push(
    req.body.ipos,
    req.body.crm
  );

  res.json(result);

});

module.exports = router;
