const jwt =
  require("jsonwebtoken");

const supabase =
  require("../supabase");

const {
  ROLE_CONFIG,
  hasPermission,
} = require(
  "../services/adminRoleService"
);


function getBearerToken(
  req
) {
  const authorization =
    req.headers.authorization;

  if (
    typeof authorization !==
      "string"
  ) {
    return null;
  }

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i
    );

  if (!match) {
    return null;
  }

  const token =
    match[1].trim();

  return token || null;
}


function buildPermissionAdmin(
  admin
) {
  const role =
    String(
      admin.role || ""
    ).trim();

  const roleConfig =
    ROLE_CONFIG[role];

  if (!roleConfig) {
    return null;
  }

  return {
    id:
      String(admin.id),

    username:
      String(
        admin.username || ""
      ),

    role,

    role_code:
      role,

    permissions:
      roleConfig.permissions,
  };
}


function requirePanelPermission(
  permission
) {
  if (
    typeof permission !== "string" ||
    !permission.trim()
  ) {
    throw new Error(
      "ADMIN_PERMISSION_REQUIRED"
    );
  }

  return async (
    req,
    res,
    next
  ) => {
    try {
      const token =
        getBearerToken(req);

      if (!token) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      const secret =
        process.env.JWT_SECRET ||
        "cing-admin-secret-2026";

      let decoded;

      try {
        decoded =
          jwt.verify(
            token,
            secret
          );
      } catch {
        return res.status(401).json({
          success: false,
          message:
            "Token invalid",
        });
      }

      const adminId =
        decoded?.id;

      if (
        adminId === undefined ||
        adminId === null ||
        adminId === ""
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid admin identity",
        });
      }

      /*
       * Do not trust role/username from an old JWT as current
       * authorization state.
       *
       * Re-hydrate the authoritative active admin row.
       */
      const {
        data: admin,
        error,
      } = await supabase
        .from("admins")
        .select(
          "id, username, role, active"
        )
        .eq(
          "id",
          adminId
        )
        .eq(
          "active",
          true
        )
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!admin) {
        return res.status(403).json({
          success: false,
          message:
            "Admin account inactive or not found",
        });
      }

      const permissionAdmin =
        buildPermissionAdmin(
          admin
        );

      if (!permissionAdmin) {
        return res.status(403).json({
          success: false,
          message:
            "Admin role not supported",
        });
      }

      if (
        !hasPermission({
          admin:
            permissionAdmin,

          permission,
        })
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Permission denied",
        });
      }

      /*
       * Downstream actor identity is backend-derived from the
       * hydrated Admin Panel account, never from caller headers.
       */
      req.admin =
        permissionAdmin;

      return next();
    } catch (error) {
      console.error(
        "admin panel permission error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          "ADMIN_PERMISSION_INTERNAL_ERROR",
      });
    }
  };
}


module.exports = {
  requirePanelPermission,
};
