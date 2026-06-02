const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const supabase = require("../supabase");
const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success:false, message:"Unauthorized" });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ success:false, message:"Token không hợp lệ" }); }
}

// GET /api/admin/missions
router.get("/", requireAdmin, async (req, res) => {
  const { data } = await supabase.from("mission_configs").select("*").order("created_at");
  res.json({ success:true, data: data||[] });
});

// POST /api/admin/missions
router.post("/", requireAdmin, async (req, res) => {
  const { type, label, description, plays, points, enabled, icon, condition_type, condition_value } = req.body;
  if (!type || !label) return res.status(400).json({ success:false, message:"Thiếu type hoặc label" });
  const { data, error } = await supabase.from("mission_configs").insert({
    type, label, description, plays:Number(plays)||1, points:Number(points)||0,
    enabled: enabled!==false, icon: icon||"🎯",
    condition_type: condition_type||"manual",
    condition_value: Number(condition_value)||0,
  }).select().single();
  if (error) return res.status(400).json({ success:false, error:error.message });
  const { clearMissionCache } = require("../services/dailyMissionService");
  clearMissionCache();
  res.json({ success:true, data });
});

// PUT /api/admin/missions/:id
router.put("/:id", requireAdmin, async (req, res) => {
  const { type, label, description, plays, points, enabled, icon, condition_type, condition_value } = req.body;
  const { data, error } = await supabase.from("mission_configs").update({
    type, label, description, plays:Number(plays)||1, points:Number(points)||0,
    enabled, icon, condition_type, condition_value:Number(condition_value)||0,
    updated_at: new Date().toISOString(),
  }).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ success:false, error:error.message });
  const { clearMissionCache } = require("../services/dailyMissionService");
  clearMissionCache();
  res.json({ success:true, data });
});

// DELETE /api/admin/missions/:id
router.delete("/:id", requireAdmin, async (req, res) => {
  await supabase.from("mission_configs").delete().eq("id", req.params.id);
  const { clearMissionCache } = require("../services/dailyMissionService");
  clearMissionCache();
  res.json({ success:true });
});

module.exports = router;
