
/**
 * =====================================================
 * CRM SYNC ROUTES
 * routes/crmSyncRoutes.js  (thêm vào routes/index.js)
 * =====================================================
 */
 
const express = require("express");
const router  = express.Router();
const {
const { normalizePhone } = require("../utils/phoneIdentity");
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
 
// POST /crm/sync-one — sync 1 user theo phone
router.post("/sync-one", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "Thiếu phone" });
    const n = normalizePhone(phone);
    const { syncOnePlayer } = require('../services/crm/crmSpendingSyncService');
    const result = await syncOnePlayer({ user_id: n });
    res.json({ success: true, result });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
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

router.post("/sync-custom-range", async (req, res) => {
  const secret = req.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  try {
    const { from, to } = req.body;
    if (!from || !to) return res.status(400).json({ success: false, error: "Missing from/to" });

    res.json({ success: true, message: "Custom range sync started" });

    const { syncCustomRangeSpending } = require("../services/crm/crmSpendingSyncService");
    await syncCustomRangeSpending(from, to);
  } catch (err) {
    console.error("Custom sync error:", err.message);
  }
});

router.get("/customers-preview", async (req, res) => {
  try {
    const axios = require("axios");
    const { page = 1 } = req.query;
    const response = await axios.get(
      "https://api.foodbook.vn/ipos/ws/partner/data/customer",
      {
        params: {
          pos_parent: process.env.IPOS_POS_PARENT,
          page,
          page_size: 10,
        },
        headers: {
          access_token: process.env.IPOS_ACCESS_TOKEN,
        },
      }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message, detail: err.response?.data });
  }
});

router.post("/import-all-customers", async (req, res) => {
  const secret = req.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  try {
    res.json({ success: true, message: "Import started" });
    const { importAllCrmCustomers } = require("../services/crm/crmCustomerImportService");
    const result = await importAllCrmCustomers();
    console.log("IMPORT DONE:", result);
  } catch (err) {
    console.error("Import error:", err.message);
  }
});
