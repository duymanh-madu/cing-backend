const ROLE_HIERARCHY = {

  super_admin: [

    "*",

  ],

  finance_admin: [

    "payment.*",

    "finance.*",

  ],

  operation_admin: [

    "system.read",

    "system.runtime.update",

    "queue.*",

  ],

  crm_admin: [

    "crm.*",

    "customer.*",

  ],

  campaign_admin: [

    "campaign.*",

    "voucher.*",

  ],

  game_admin: [

    "game.*",

    "leaderboard.*",

  ],

};

/**
 * =====================================================
 * GET ROLE PERMISSIONS
 * =====================================================
 */

function getRolePermissions(
  role
) {

  return (
    ROLE_HIERARCHY[
      role
    ] || []
  );

}

/**
 * =====================================================
 * CHECK ROLE ACCESS
 * =====================================================
 */

function hasRolePermission({

  role,

  permission,

}) {

  const permissions =
    getRolePermissions(
      role
    );

  if (
    permissions.includes(
      "*"
    )
  ) {

    return true;

  }

  return permissions.some(
    (
      item
    ) => {

      if (
        item ===
        permission
      ) {

        return true;

      }

      if (
        item.endsWith(
          ".*"
        )
      ) {

        const prefix =
          item.replace(
            ".*",
            ""
          );

        return permission.startsWith(
          prefix
        );

      }

      return false;

    }
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  ROLE_HIERARCHY,

  getRolePermissions,

  hasRolePermission,

};