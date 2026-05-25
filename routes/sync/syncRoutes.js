const express = require("express");
const router = express.Router();

const syncQueue = require("../../services/queue/syncQueue");

/**
 * PUSH SYNC JOB FROM iPOS
 */
router.post("/ipos-sync", async (req, res) => {

  const payload = req.body;

  await syncQueue.push({
    ipos: payload.ipos,
    crm: payload.crm,
    timestamp: Date.now()
  });

  res.json({
    status: "queued",
  });

});

module.exports = router;
