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

  // Tạo member trong iPOS nếu chưa có
  if (customer.phone) {
    try {
      const { getMember, addMember } = require("../foodbook");
      const existing = await getMember(customer.phone).catch(() => null);
      if (!existing?.success || !existing?.data?.data) {
        // Chưa có trong CRM → tạo mới
        await addMember({
          phone: customer.phone,
          name: zaloUser.name || customer.name || "Khách hàng",
          birthday: zaloUser.birthday || "",
        });
        console.log("[AUTH] iPOS member created for:", customer.phone);
      } else {
        console.log("[AUTH] iPOS member already exists:", customer.phone);
      }
    } catch(e) { console.warn("[AUTH] addMember failed:", e.message); }
  }

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

  // Lấy tên từ Zalo OA API nếu chưa có name thật
  if ((!zaloUser.name || zaloUser.name === "Khách hàng") && (zaloUser.zalo_id || zaloUser.id)) {
    try {
      const { data: cfg } = await require("../../supabase")
        .from("app_configs").select("zalo_oa_access_token").eq("id", 1).single();
      const oaToken = cfg?.zalo_oa_access_token;
      const zaloId = zaloUser.zalo_id || zaloUser.id;
      if (oaToken && zaloId) {
        const profileRes = await fetch(
          `https://openapi.zalo.me/v2.0/oa/getprofile?user_id=${zaloId}`,
          { headers: { access_token: oaToken } }
        );
        const profileData = await profileRes.json();
        if (profileData?.data?.display_name) {
          zaloUser.name = profileData.data.display_name;
          zaloUser.avatar = profileData.data.avatar || zaloUser.avatar || "";
          // Update customer name
          await require("../../supabase").from("customers")
            .update({ name: zaloUser.name, avatar: zaloUser.avatar || null })
            .eq("zalo_id", zaloId);
          console.log("[AUTH] Zalo OA profile fetched:", zaloUser.name);
        }
      }
    } catch(e) { console.warn("[AUTH] fetch Zalo OA profile failed:", e.message); }
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

  // Sync zalo_user_id vào players table — cần cho CDP (UID/ZBS gửi tin qua Zalo OA)
  try {
    const zaloId = zaloUser.zalo_id || zaloUser.id || "";
    const phone = normalizePhone(customer.phone || zaloUser.phone || "");
    if (zaloId && phone && phone.length >= 9) {
      const { error: zErr } = await require("../../supabase")
        .from("players")
        .update({ zalo_user_id: zaloId })
        .eq("user_id", phone)
        .is("zalo_user_id", null); // chỉ set nếu chưa có, tránh overwrite
      if (zErr) console.warn("[AUTH] players.zalo_user_id sync failed:", zErr.message);
      else console.log(`[AUTH] players.zalo_user_id synced: ${phone} -> ${zaloId}`);
    }
  } catch(e) { console.warn("[AUTH] zalo_user_id sync error:", e.message); }

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