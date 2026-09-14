const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const supabase = require("../supabase");

const {
  JWT_SECRET,
} = require(
  "../utils/jwtSecretAuthority"
);
const JWT_EXPIRES = "8h";

const ADMIN_ROLES = new Set([
  "super_admin",
  "manager",
  "cashier",
  "kitchen",
  "shipper",
  "marketing",
  "delivery_admin",
]);

const STORE_BOUND_ROLES = new Set([
  "cashier",
]);

function normalizeStoreId(value) {
  const normalized =
    value === undefined ||
    value === null
      ? ""
      : String(value).trim();

  return normalized || null;
}

async function resolveAdminStoreBinding({
  role,
  storeId,
}) {
  const normalizedRole =
    String(role || "").trim();

  if (!ADMIN_ROLES.has(normalizedRole)) {
    const error =
      new Error("Role không hợp lệ");

    error.statusCode = 400;
    error.code =
      "ADMIN_ROLE_INVALID";

    throw error;
  }

  const normalizedStoreId =
    normalizeStoreId(storeId);

  if (
    STORE_BOUND_ROLES.has(
      normalizedRole
    ) &&
    !normalizedStoreId
  ) {
    const error =
      new Error(
        "Tài khoản thu ngân phải được gán cửa hàng"
      );

    error.statusCode = 400;
    error.code =
      "ADMIN_CASHIER_STORE_REQUIRED";

    throw error;
  }

  if (
    normalizedRole !==
      "cashier" &&
    normalizedRole !==
      "super_admin" &&
    normalizedStoreId
  ) {
    const error =
      new Error(
        "Role này không được gán cửa hàng Cing Pay"
      );

    error.statusCode = 400;
    error.code =
      "ADMIN_STORE_ROLE_NOT_ALLOWED";

    throw error;
  }

  if (!normalizedStoreId) {
    return {
      store_id: null,
      store: null,
    };
  }

  const {
    data: store,
    error,
  } =
    await supabase
      .from(
        "cing_wallet_pos_stores"
      )
      .select(
        "id, store_code, display_name, pos_parent, pos_id, active"
      )
      .eq(
        "id",
        normalizedStoreId
      )
      .eq(
        "active",
        true
      )
      .maybeSingle();

  if (error) {
    const wrapped =
      new Error(
        "Không thể kiểm tra cửa hàng Cing Pay"
      );

    wrapped.statusCode = 500;
    wrapped.code =
      "ADMIN_STORE_LOOKUP_FAILED";
    wrapped.cause = error;

    throw wrapped;
  }

  if (!store) {
    const invalid =
      new Error(
        "Cửa hàng Cing Pay không tồn tại hoặc đã bị vô hiệu hóa"
      );

    invalid.statusCode = 400;
    invalid.code =
      "ADMIN_STORE_INVALID";

    throw invalid;
  }

  return {
    store_id:
      String(store.id),
    store,
  };
}

function sendAdminError(
  res,
  error
) {
  return res
    .status(
      Number(
        error?.statusCode
      ) || 500
    )
    .json({
      success: false,
      code:
        error?.code ||
        "ADMIN_ACCOUNT_FAILED",
      message:
        error?.message ||
        "Không thể xử lý tài khoản Admin",
    });
}

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

router.get(
  "/stores",
  verifyAdmin,
  async (
    req,
    res
  ) => {
    try {
      if (
        req.admin.role !==
        "super_admin"
      ) {
        return res.status(403).json({
          success: false,
          code:
            "ADMIN_SUPER_ADMIN_REQUIRED",
          message:
            "Chỉ Super Admin mới có quyền xem cấu hình cửa hàng",
        });
      }

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "cing_wallet_pos_stores"
          )
          .select(
            "id, store_code, display_name, active"
          )
          .eq(
            "active",
            true
          )
          .order(
            "display_name",
            {
              ascending: true,
            }
          );

      if (error) {
        throw error;
      }

      return res.json({
        success: true,
        data:
          data || [],
      });
    } catch (error) {
      return sendAdminError(
        res,
        error
      );
    }
  }
);


router.get("/list", verifyAdmin, async (req, res) => {
  try {
    if (req.admin.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        code:
          "ADMIN_SUPER_ADMIN_REQUIRED",
        message:
          "Chỉ Super Admin mới có quyền xem tài khoản",
      });
    }

    const {
      data,
      error,
    } =
      await supabase
        .from("admins")
        .select(`
          id,
          username,
          role,
          active,
          created_at,
          store_id,
          store:cing_wallet_pos_stores!admins_cing_wallet_pos_store_fk(
            id,
            store_code,
            display_name,
            pos_parent,
            pos_id,
            active
          )
        `)
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      data:
        data || [],
    });
  } catch (error) {
    return sendAdminError(
      res,
      error
    );
  }
});

// POST /api/admin/auth/create — tạo tài khoản admin mới
router.post("/create", verifyAdmin, async (req, res) => {
  try {
    if (
      req.admin.role !==
      "super_admin"
    ) {
      return res.status(403).json({
        success: false,
        code:
          "ADMIN_SUPER_ADMIN_REQUIRED",
        message:
          "Chỉ Super Admin mới có quyền tạo tài khoản",
      });
    }

    const {
      username,
      password,
      role,
      store_id,
    } =
      req.body || {};

    const normalizedUsername =
      String(
        username || ""
      ).trim();

    if (
      !normalizedUsername ||
      !password ||
      !role
    ) {
      return res.status(400).json({
        success: false,
        code:
          "ADMIN_CREATE_INPUT_REQUIRED",
        message:
          "Thiếu thông tin",
      });
    }

    const binding =
      await resolveAdminStoreBinding({
        role,
        storeId:
          store_id,
      });

    const {
      data: existing,
      error: existingError,
    } =
      await supabase
        .from("admins")
        .select("id")
        .eq(
          "username",
          normalizedUsername
        )
        .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      return res.status(400).json({
        success: false,
        code:
          "ADMIN_USERNAME_EXISTS",
        message:
          "Username đã tồn tại",
      });
    }

    const hashed =
      await bcrypt.hash(
        password,
        10
      );

    const {
      data,
      error,
    } =
      await supabase
        .from("admins")
        .insert({
          username:
            normalizedUsername,
          password:
            hashed,
          role,
          store_id:
            binding.store_id,
          active:
            true,
          created_at:
            new Date()
              .toISOString(),
        })
        .select(
          "id, username, role, store_id, active, created_at"
        )
        .single();

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      data: {
        ...data,
        store:
          binding.store,
      },
    });
  } catch (error) {
    return sendAdminError(
      res,
      error
    );
  }
});


router.put(
  "/account/:id",
  verifyAdmin,
  async (
    req,
    res
  ) => {
    try {
      if (
        req.admin.role !==
        "super_admin"
      ) {
        return res.status(403).json({
          success: false,
          code:
            "ADMIN_SUPER_ADMIN_REQUIRED",
          message:
            "Chỉ Super Admin mới có quyền sửa tài khoản",
        });
      }

      const targetId =
        String(
          req.params.id || ""
        ).trim();

      if (!targetId) {
        return res.status(400).json({
          success: false,
          code:
            "ADMIN_ACCOUNT_ID_REQUIRED",
          message:
            "Thiếu tài khoản cần cập nhật",
        });
      }

      const {
        data: existing,
        error: existingError,
      } =
        await supabase
          .from("admins")
          .select(
            "id, username, role, store_id, active"
          )
          .eq(
            "id",
            targetId
          )
          .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (!existing) {
        return res.status(404).json({
          success: false,
          code:
            "ADMIN_ACCOUNT_NOT_FOUND",
          message:
            "Không tìm thấy tài khoản",
        });
      }

      const body =
        req.body;

      if (
        !body ||
        typeof body !==
          "object" ||
        Array.isArray(body)
      ) {
        return res.status(400).json({
          success: false,
          code:
            "ADMIN_ACCOUNT_BODY_INVALID",
          message:
            "Dữ liệu cập nhật không hợp lệ",
        });
      }

      const allowedKeys =
        new Set([
          "role",
          "store_id",
        ]);

      if (
        Object.keys(
          body
        ).some(
          key =>
            !allowedKeys.has(
              key
            )
        )
      ) {
        return res.status(400).json({
          success: false,
          code:
            "ADMIN_ACCOUNT_BODY_INVALID",
          message:
            "Dữ liệu cập nhật không hợp lệ",
        });
      }

      const nextRole =
        Object.prototype
          .hasOwnProperty.call(
            body,
            "role"
          )
          ? String(
              body.role || ""
            ).trim()
          : existing.role;

      const nextStoreId =
        Object.prototype
          .hasOwnProperty.call(
            body,
            "store_id"
          )
          ? body.store_id
          : existing.store_id;

      const binding =
        await resolveAdminStoreBinding({
          role:
            nextRole,
          storeId:
            nextStoreId,
        });

      if (
        String(
          req.admin.id
        ) ===
          String(
            existing.id
          ) &&
        nextRole !==
          "super_admin"
      ) {
        return res.status(400).json({
          success: false,
          code:
            "ADMIN_SELF_SUPER_ADMIN_ROLE_REQUIRED",
          message:
            "Không thể tự hạ quyền Super Admin của chính mình",
        });
      }

      const {
        data,
        error,
      } =
        await supabase
          .from("admins")
          .update({
            role:
              nextRole,
            store_id:
              binding.store_id,
          })
          .eq(
            "id",
            existing.id
          )
          .select(
            "id, username, role, store_id, active, created_at"
          )
          .single();

      if (error) {
        throw error;
      }

      return res.json({
        success: true,
        data: {
          ...data,
          store:
            binding.store,
        },
      });
    } catch (error) {
      return sendAdminError(
        res,
        error
      );
    }
  }
);


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
