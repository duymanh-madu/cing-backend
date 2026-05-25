const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const supabase = require("../supabase");

const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";
const JWT_EXPIRES = "8h";

// POST /api/admin/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: "Thiếu thông tin" });

    const { data: admin } = await supabase
      .from("admins").select("*").eq("username", username).eq("active", true).single();

    if (!admin)
      return res.status(401).json({ success: false, message: "Tài khoản không tồn tại" });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid)
      return res.status(401).json({ success: false, message: "Mật khẩu không đúng" });

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role },
      JWT_SECRET, { expiresIn: JWT_EXPIRES }
    );

    res.json({ success: true, token, admin: { username: admin.username, role: admin.role } });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Middleware verify token
function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: "Token invalid" });
  }
}

// GET /api/admin/auth/me
router.get("/me", verifyAdmin, (req, res) => {
  res.json({ success: true, admin: req.admin });
});

module.exports = router;
module.exports.verifyAdmin = verifyAdmin;
