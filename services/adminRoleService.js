const supabase =
  require("../supabase");

/**
 * ============================================
 * ROLE CONFIG
 * ============================================
 */

const ROLE_CONFIG = {

  super_admin: {

    role_name:
      "Super Admin",

    permissions: [

      "*",

    ],

  },

  manager: {

    role_name:
      "Manager",

    permissions: [

      "dashboard.view",

      "orders.view",

      "orders.update",

      "payments.view",

      "delivery.view",

      "analytics.view",

      "notifications.send",

      "campaigns.manage",

    ],

  },

  cashier: {

    role_name:
      "Cashier",

    permissions: [

      "dashboard.view",

      "orders.view",

      "orders.update",

      "payments.view",

    ],

  },

  kitchen: {

    role_name:
      "Kitchen",

    permissions: [

      "orders.view",

      "orders.preparing",

      "orders.ready",

    ],

  },

  shipper: {

    role_name:
      "Shipper",

    permissions: [

      "delivery.view",

      "delivery.update",

    ],

  },

  marketing: {

    role_name:
      "Marketing",

    permissions: [

      "dashboard.view",

      "analytics.view",

      "campaigns.manage",

      "notifications.send",

    ],

  },

};

/**
 * ============================================
 * GET ADMIN ROLE
 * ============================================
 */

async function getAdminRole({

  user_id,

  zalo_user_id,

}) {

  let query =
    supabase

      .from("admin_roles")

      .select("*")

      .eq(
        "is_active",
        true
      );

  if (user_id) {

    query =
      query.eq(
        "user_id",
        user_id
      );

  }

  if (zalo_user_id) {

    query =
      query.eq(
        "zalo_user_id",
        zalo_user_id
      );

  }

  const {

    data,

    error,

  } = await query

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

/**
 * ============================================
 * CHECK PERMISSION
 * ============================================
 */

function hasPermission({

  admin,

  permission,

}) {

  if (!admin) {

    return false;

  }

  const permissions =

    Array.isArray(
      admin.permissions
    )

      ? admin.permissions

      : [];

  /**
   * SUPER ADMIN
   */

  if (

    permissions.includes(
      "*"
    )

  ) {

    return true;

  }

  return permissions.includes(
    permission
  );

}

/**
 * ============================================
 * CREATE ADMIN ROLE
 * ============================================
 */

async function createAdminRole({

  user_id,

  zalo_user_id,

  full_name,

  phone_number,

  role_code,

  store_id = null,

  store_name = null,

  created_by = null,

  metadata = {},

}) {

  /**
   * VALIDATE ROLE
   */

  const roleConfig =

    ROLE_CONFIG[
      role_code
    ];

  if (!roleConfig) {

    throw new Error(
      "Invalid role_code"
    );

  }

  /**
   * DUPLICATE CHECK
   */

  const existing =
    await getAdminRole({

      user_id,

      zalo_user_id,

    });

  if (existing) {

    return {

      success: true,

      duplicated: true,

      admin: existing,

    };

  }

  /**
   * CREATE
   */

  const {

    data,

    error,

  } = await supabase

    .from("admin_roles")

    .insert({

      user_id,

      zalo_user_id,

      full_name,

      phone_number,

      role_code,

      role_name:
        roleConfig.role_name,

      permissions:
        roleConfig.permissions,

      store_id,

      store_name,

      created_by,

      metadata,

      created_at:
        new Date(),

      updated_at:
        new Date(),

    })

    .select("*")

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return {

    success: true,

    admin: data,

  };

}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {

  ROLE_CONFIG,

  getAdminRole,

  hasPermission,

  createAdminRole,

};