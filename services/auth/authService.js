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

const { normalizePhone } = require("../../utils/phoneIdentity");

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

  console.log("[AUTH] loginWithZalo body:", JSON.stringify({ zalo_id: zaloUser.zalo_id, has_phone_token: !!zaloUser.phone_token, has_mini_token: !!zaloUser.mini_access_token, has_avatar: !!zaloUser.avatar, avatar_len: (zaloUser.avatar||"").length }));
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

  // Lấy birthday từ iPOS nếu chưa có
  if (!zaloUser.birthday) {
    try {
      const phone = normalizePhone(zaloUser.phone);
      if (phone) {
        const { getMember } = require("../foodbook");
        const memberResult = await getMember(phone).catch(() => null);
        if (memberResult?.success && memberResult?.data?.data?.birthday) {
          // iPOS format: "1990-07-11 00:00:00" → "1990-07-11"
          zaloUser.birthday = memberResult.data.data.birthday.split(" ")[0];
        }
      }
    } catch(e) {}
  }

  // Đọc avatar từ players table (custom avatar user đã upload)
  try {
    const zaloId = zaloUser.zalo_id || zaloUser.id || "";
    if (zaloId) {
      const { data: playerData } = await require("../../supabase")
        .from("players")
        .select("avatar, display_name, zalo_name")
        .eq("zalo_user_id", zaloId)
        .maybeSingle();
      if (playerData?.avatar) customer.avatar = playerData.avatar;
      const displayName = playerData?.display_name || playerData?.zalo_name;
      if (displayName && displayName !== "Khách hàng") {
        customer.name = displayName;
      }
    }
  } catch(e) { console.warn("[AUTH] read player avatar failed:", e.message); }

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