const {

  getAdminRole,

  hasPermission,

} = require(
  "../services/adminRoleService"
);

/**
 * ============================================
 * ADMIN AUTH
 * ============================================
 */

function requirePermission(

  permission

) {

  return async (

    req,

    res,

    next

  ) => {

    try {

      /**
       * HEADERS
       */

      const user_id =

        req.headers[
          "x-user-id"
        ];

      const zalo_user_id =

        req.headers[
          "x-zalo-user-id"
        ];

      /**
       * VALIDATE
       */

      if (

        !user_id &&

        !zalo_user_id

      ) {

        return res.status(401).json({

          success: false,

          message:
            "Unauthorized",

        });

      }

      /**
       * FIND ADMIN
       */

      const admin =
        await getAdminRole({

          user_id,

          zalo_user_id,

        });

      if (!admin) {

        return res.status(403).json({

          success: false,

          message:
            "Admin role not found",

        });

      }

      /**
       * CHECK PERMISSION
       */

      const allowed =
        hasPermission({

          admin,

          permission,

        });

      if (!allowed) {

        return res.status(403).json({

          success: false,

          message:
            "Permission denied",

        });

      }

      /**
       * REQUEST ADMIN
       */

      req.admin =
        admin;

      next();

    } catch (error) {

      console.error(

        "admin auth error:",

        error.message

      );

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  };

}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {

  requirePermission,

};