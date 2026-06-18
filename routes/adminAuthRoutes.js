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

// GET /api/admin/auth/list — danh sách tài khoản admin
// GET /api/admin/auth/system-badges — public badge map for app UI
router.get("/system-badges", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("admins")
      .select("user_id, role, active")
      .eq("active", true)
      .not("user_id", "is", null);

    if (error) throw error;

    const map = {};
    for (const a of data || []) {
      const uid = String(a.user_id || "").replace(/\D/g, "").replace(/^84/, "0");
      if (!uid) continue;
      map[uid] = {
        role: a.role,
        badge: a.role === "super_admin" ? "super_admin" : "admin",
      };
    }

    res.json({ success: true, data: map });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/list", verifyAdmin, async (req, res) => {
  try {
    const { data } = await supabase
      .from("admins")
      .select("id, username, role, active, created_at")
      .order("created_at", { ascending: false });
    res.json({ success: true, data: data || [] });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/auth/create — tạo tài khoản admin mới
router.post("/create", verifyAdmin, async (req, res) => {
  try {
    if (req.admin.role !== "super_admin")
      return res.status(403).json({ success: false, message: "Chỉ Super Admin mới có quyền tạo tài khoản" });
    const { username, password, role } = req.body;
    if (!username || !password || !role)
      return res.status(400).json({ success: false, message: "Thiếu thông tin" });
    const validRoles = [
  "super_admin",
  "manager",
  "cashier",
  "kitchen",
  "shipper",
  "marketing",
  "delivery_admin"
];
    if (!validRoles.includes(role))
      return res.status(400).json({ success: false, message: "Role không hợp lệ" });
    const { data: existing } = await supabase
      .from("admins").select("id").eq("username", username).single();
    if (existing)
      return res.status(400).json({ success: false, message: "Username đã tồn tại" });
    const hashed = await bcrypt.hash(password, 10);
    const { data, error } = await supabase.from("admins").insert({
      username, password: hashed, role, active: true,
      created_at: new Date().toISOString(),
    }).select("id, username, role, active, created_at").single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/auth/change-password — đổi mật khẩu
router.put("/change-password", verifyAdmin, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ success: false, message: "Thiếu thông tin" });
    if (new_password.length < 6)
      return res.status(400).json({ success: false, message: "Mật khẩu mới phải ít nhất 6 ký tự" });
    const { data: admin } = await supabase
      .from("admins").select("*").eq("id", req.admin.id).single();
    if (!admin) return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản" });
    const valid = await bcrypt.compare(current_password, admin.password);
    if (!valid) return res.status(401).json({ success: false, message: "Mật khẩu hiện tại không đúng" });
    const hashed = await bcrypt.hash(new_password, 10);
    await supabase.from("admins").update({ password: hashed }).eq("id", req.admin.id);
    res.json({ success: true, message: "Đổi mật khẩu thành công" });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/auth/toggle/:id — bật/tắt tài khoản
router.put("/toggle/:id", verifyAdmin, async (req, res) => {
  try {
    if (req.admin.role !== "super_admin")
      return res.status(403).json({ success: false, message: "Chỉ Super Admin mới có quyền" });
    if (String(req.admin.id) === String(req.params.id))
      return res.status(400).json({ success: false, message: "Không thể vô hiệu hóa chính mình" });
    const { data: admin } = await supabase
      .from("admins").select("active").eq("id", req.params.id).single();
    if (!admin) return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản" });
    const { error } = await supabase.from("admins")
      .update({ active: !admin.active }).eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true, message: `Đã ${!admin.active ? "kích hoạt" : "vô hiệu hóa"} tài khoản` });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/auth/reset-password/:id — reset mật khẩu (super_admin)
router.put("/reset-password/:id", verifyAdmin, async (req, res) => {
  try {
    if (req.admin.role !== "super_admin")
      return res.status(403).json({ success: false, message: "Chỉ Super Admin mới có quyền" });
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ success: false, message: "Mật khẩu phải ít nhất 6 ký tự" });
    const hashed = await bcrypt.hash(new_password, 10);
    const { error } = await supabase.from("admins")
      .update({ password: hashed }).eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true, message: "Đã reset mật khẩu thành công" });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
