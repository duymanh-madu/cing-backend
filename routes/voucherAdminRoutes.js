const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const supabase = require("../supabase");
const { issueVoucher } = require("../services/voucherDistributionService");

const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ success: false, message: "Token không hợp lệ" }); }
}

// GET /admin/vouchers/list
router.get("/list", requireAdmin, async (req, res) => {
  try {
    const { data } = await supabase.from("vouchers").select("*").order("created_at", { ascending:false }).limit(100);
    res.json({ success:true, data: data||[] });
  } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});

// POST /admin/vouchers/create
router.post("/create", requireAdmin, async (req, res) => {
  try {
    const { code, type, value, min_order, max_uses, expires_at, description } = req.body;
    if (!code || !type || !value) return res.status(400).json({ success:false, message:"Thiếu thông tin" });
    const { data, error } = await supabase.from("vouchers").insert({
      code: code.toUpperCase(), type, value: Number(value),
      min_order: Number(min_order)||0,
      max_uses: Number(max_uses)||null,
      used_count: 0,
      expires_at: expires_at||null,
      description: description||"",
      is_active: true,
      created_at: new Date().toISOString(),
    }).select().single();
    if (error) return res.status(400).json({ success:false, error:error.message });
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});

// POST /admin/vouchers/issue
router.post("/issue", requireAdmin, async (req, res) => {
  try {
    const { user_id, template_id } = req.body;
    const { data: template } = await supabase
      .from("voucher_templates").select("*").eq("id", template_id).maybeSingle();
    if (!template) throw new Error("Template not found");
    const result = await issueVoucher({ user_id, template });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
