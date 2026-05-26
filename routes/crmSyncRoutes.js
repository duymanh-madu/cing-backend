
/**
 * =====================================================
 * CRM SYNC ROUTES
 * routes/crmSyncRoutes.js  (thêm vào routes/index.js)
 * =====================================================
 */
 
const express = require("express");
const router  = express.Router();
const {
  syncAllPlayersCrmSpending,
  syncSingleUserSpending,
} = require("../services/crm/crmSpendingSyncService");
 
/**
 * POST /crm/sync-spending
 * Trigger sync toàn bộ (dùng cho cron job hoặc admin)
 * Header: x-cron-secret = process.env.CRON_SECRET
 */
router.post("/sync-spending", async (req, res) => {
  // Bảo vệ endpoint bằng secret header
  const secret = req.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
 
  try {
    // Chạy async, trả về ngay để tránh timeout
    res.json({ success: true, message: "CRM spending sync started" });
 
    // Chạy sync sau khi đã trả response
    const result = await syncAllPlayersCrmSpending({
      batchSize: 3,    // 3 users cùng lúc
      delayMs:   1500, // 1.5s giữa các batch
    });
 
    console.log("✅ CRM sync completed:", result.stats);
  } catch (err) {
    console.error("❌ CRM sync error:", err.message);
  }
});
 
/**
 * POST /crm/sync-spending/:userId
 * Sync 1 user cụ thể (trigger ngay sau khi user đặt hàng)
 */
router.post("/sync-spending/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await syncSingleUserSpending(userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
 
/**
 * GET /crm/spending-preview/:userId
 * Xem thử data CRM của 1 user (debug)
 */
router.get("/spending-preview/:userId", async (req, res) => {
  try {
    const foodbook = require("../services/foodbook");
    const { userId } = req.params;
 
    const [transactions, member] = await Promise.all([
      foodbook.getMemberTransactions(userId),
      foodbook.getMember(userId),
    ]);
 
    res.json({
      success: true,
      member:       member.data,
      transactions: transactions.data,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
 
module.exports = router;
router.get("/log-preview/:userId", async (req, res) => {
  try {
    const foodbook = require("../services/foodbook");
    const { userId } = req.params;
    const { from, to } = req.query;
    const result = await foodbook.getMembershipLog(userId, {
      log_type: "PAY",
      create_from: from || "2026-01-01 00:00:00",
      create_to: to || "2026-12-31 23:59:59",
      page_size: 500,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/log-raw/:userId", async (req, res) => {
  try {
    const axios = require("axios");
    const { userId } = req.params;
    const response = await axios.get(
      "https://api.foodbook.vn/ipos/ws/xpartner/membership_log",
      {
        params: {
          access_token: process.env.IPOS_ACCESS_TOKEN,
          pos_parent:   process.env.IPOS_POS_PARENT,
          user_id:      userId,
          page:         1,
          log_type:     "PAY",
          create_from:  req.query.from || "2026-01-01 00:00:00",
          create_to:    req.query.to   || "2026-12-31 23:59:59",
          page_size:    500,
        },
      }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
