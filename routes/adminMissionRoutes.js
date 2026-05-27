const express  = require("express");
const router   = express.Router();
const jwt      = require("jsonwebtoken");
const supabase = require("../supabase");

const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ success: false, message: "Token không hợp lệ" }); }
}

router.get("/", requireAdmin, async (req, res) => {
  try {
    const { data } = await supabase.from("app_configs").select("missions").eq("id", 1).single();
    res.json({ success: true, data: data?.missions || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put("/", requireAdmin, async (req, res) => {
  try {
    const { missions } = req.body;
    const { error } = await supabase.from("app_configs")
      .update({ missions }).eq("id", 1);
    if (error) throw error;
    res.json({ success: true, message: "Đã lưu nhiệm vụ" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
