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
    const { title, description, image, discount_type, discount_value, quantity } = req.body;
    if (!title || !discount_type || discount_value === undefined || discount_value === null || discount_value === "") {
      return res.status(400).json({ success:false, message:"Thiếu thông tin: cần Tên voucher, Loại giảm giá và Giá trị giảm" });
    }
    if (!["percent","fixed","free_ship"].includes(discount_type)) {
      return res.status(400).json({ success:false, message:"Loại giảm giá không hợp lệ" });
    }
    const qty = quantity === "" || quantity === undefined ? null : Number(quantity);
    const { data, error } = await supabase.from("vouchers").insert({
      title,
      description: description || "",
      image: image || null,
      discount_type,
      discount_value: Number(discount_value),
      quantity: qty,
      remaining: qty,
      active: true,
      created_at: new Date().toISOString(),
    }).select().single();
    if (error) return res.status(400).json({ success:false, error:error.message });
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});

// PATCH /admin/vouchers/:id/toggle — bật/tắt voucher
router.patch("/:id/toggle", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: current, error: getErr } = await supabase.from("vouchers")
      .select("active").eq("id", id).maybeSingle();
    if (getErr) return res.status(400).json({ success:false, error:getErr.message });
    if (!current) return res.status(404).json({ success:false, message:"Không tìm thấy voucher" });

    const { data, error } = await supabase.from("vouchers")
      .update({ active: !current.active }).eq("id", id).select().single();
    if (error) return res.status(400).json({ success:false, error:error.message });
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});

// DELETE /admin/vouchers/:id
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("vouchers").delete().eq("id", id);
    if (error) return res.status(400).json({ success:false, error:error.message });
    res.json({ success:true });
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
