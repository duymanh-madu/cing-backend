const express = require("express");
const router = express.Router();
const { getDailyMissions, doCheckin } = require("../services/dailyMissionService");

// GET /api/missions/:user_id
router.get("/:user_id", async (req, res) => {
  try {
    const missions = await getDailyMissions(req.params.user_id);
    res.json({ success: true, data: missions });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/missions/checkin
router.post("/checkin", async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ success: false, message: "Thiếu user_id" });
    const result = await doCheckin(user_id);
    res.json(result);
  } catch(err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
