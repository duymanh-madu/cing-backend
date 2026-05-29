const jwt =
  require("jsonwebtoken");

const { decodePhoneToken } =
  require("./zaloPhoneService");

const redisClient =
  require("../infrastructure/cache/redisClient");

const customerRepository =
  require(
    "../../repositories/customer/customerRepository"
  );

const sessionRepository =
  require(
    "../../repositories/auth/sessionRepository"
  );

const tokenService =
  require(
    "./tokenService"
  );

const logger =
  require(
    "../loggerService"
  );

/**
 * =====================================================
 * LOGIN
 * =====================================================
 */

async function loginWithZalo({
  zaloUser,
}) {

  console.log("[AUTH] loginWithZalo body:", JSON.stringify({ zalo_id: zaloUser.zalo_id, has_phone_token: !!zaloUser.phone_token, has_mini_token: !!zaloUser.mini_access_token }));
  // Decode phone token trước khi upsert customer
  if (zaloUser.phone_token && (!zaloUser.phone || zaloUser.phone === "pending")) {
    const phone = await decodePhoneToken({
      phoneToken:      zaloUser.phone_token       || "",
      miniAccessToken: zaloUser.mini_access_token || "",
    }).catch(() => null);
    if (phone) {
      zaloUser.phone = phone;
      console.log("[AUTH] Phone decoded before upsert:", phone);
    }
  }

  const customer =
    await customerRepository.upsertCustomer({
      zaloUser,
    });

  // Merge avatar/name từ players table (custom profile) nếu có
  try {
    const phone = (zaloUser.phone || "").replace(/\D/g,"").replace(/^84/,"0");
    const { data: playerProfile } = await require("../../supabase")
      .from("players")
      .select("zalo_name, avatar")
      .eq("user_id", phone)
      .maybeSingle();
    if (playerProfile?.avatar) customer.avatar = playerProfile.avatar;
    if (playerProfile?.zalo_name && playerProfile.zalo_name !== "Khách hàng") {
      customer.name = playerProfile.zalo_name;
    }
    // Sync ngược lại vào customers table để data sạch
    if (phone && (playerProfile?.avatar || playerProfile?.zalo_name)) {
      const updateData = {};
      if (playerProfile?.avatar) updateData.avatar = playerProfile.avatar;
      if (playerProfile?.zalo_name && playerProfile.zalo_name !== "Khách hàng") {
        updateData.name = playerProfile.zalo_name;
      }
      if (Object.keys(updateData).length > 0) {
        await require("../../supabase")
          .from("customers").update(updateData).eq("phone", phone).catch(() => {});
      }
    }
  } catch(e) {}

  // Invalidate Redis membership cache để force fresh data
  if (customer.phone) {
    try {
      await redisClient.del(`membership:${customer.phone}`);
      console.log("[AUTH] Redis cache invalidated for:", customer.phone);
    } catch(e) {
      console.warn("[AUTH] Redis invalidation failed:", e.message);
    }
  }

  const accessToken =
    tokenService.generateAccessToken({
      customer,
    });

  const refreshToken =
    tokenService.generateRefreshToken({
      customer,
    });

  await sessionRepository.createSession({

    customerId:
      customer.id,

    refreshToken,

  });

  logger.info(
    "customer logged in",
    {
      customerId:
        customer.id,
    }
  );

  return {

    customer,

    accessToken,

    refreshToken,

  };

}

/**
 * =====================================================
 * REFRESH
 * =====================================================
 */

async function refreshSession({
  refreshToken,
}) {

  const payload =
    jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET
    );

  const customer =
    await customerRepository.findById(
      payload.customerId
    );

  // Invalidate Redis membership cache để force fresh data
  if (customer.phone) {
    try {
      await redisClient.del(`membership:${customer.phone}`);
      console.log("[AUTH] Redis cache invalidated for:", customer.phone);
    } catch(e) {
      console.warn("[AUTH] Redis invalidation failed:", e.message);
    }
  }

  const accessToken =
    tokenService.generateAccessToken({
      customer,
    });

  return {

    accessToken,

    customer,

  };

}

/**
 * =====================================================
 * LOGOUT
 * =====================================================
 */

async function logout({
  customerId,
}) {

  await sessionRepository.deleteCustomerSessions({
    customerId,
  });

}

module.exports = {

  loginWithZalo,
  refreshSession,
  logout,

};