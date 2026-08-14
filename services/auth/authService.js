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

const {
  claimNationalDayLoginReward,
} = require("../campaign/nationalDayLoginRewardService");

const logger =
  require(
    "../loggerService"
  );

const GENERIC_AUTH_NAMES = new Set([
  "khách hàng",
  "khach hang",
  "khách",
  "khach",
  "guest",
  "hội viên",
  "hoi vien",
]);

function cleanDisplayName(value) {
  const name = String(value || "").trim();
  if (!name) return "";
  if (GENERIC_AUTH_NAMES.has(name.toLowerCase())) return "";
  return name;
}

function pickDisplayName(...values) {
  for (const value of values) {
    const name = cleanDisplayName(value);
    if (name) return name;
  }
  return "";
}

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

  // Lấy tên/avatar từ Zalo OA trước khi upsert customer/iPOS.
  // Nếu frontend không trả được getUserInfo, backend vẫn không để user mới bị ghi là "Khách hàng".
  const zaloId = zaloUser.zalo_id || zaloUser.id || "";
  if (!cleanDisplayName(zaloUser.name) && zaloId) {
    try {
      const { data: cfg } = await require("../../supabase")
        .from("app_configs").select("zalo_oa_access_token").eq("id", 1).single();
      const oaToken = cfg?.zalo_oa_access_token;
      if (oaToken) {
        const profileRes = await fetch(
          `https://openapi.zalo.me/v2.0/oa/getprofile?user_id=${zaloId}`,
          { headers: { access_token: oaToken } }
        );
        const profileData = await profileRes.json();
        if (profileData?.data?.display_name) {
          zaloUser.name = profileData.data.display_name;
          zaloUser.avatar = profileData.data.avatar || zaloUser.avatar || "";
          console.log("[AUTH] Zalo OA profile fetched before upsert:", zaloUser.name);
        }
      }
    } catch(e) { console.warn("[AUTH] fetch Zalo OA profile failed:", e.message); }
  }

  let crmMemberData = null;
  const normalizedLoginPhone = normalizePhone(zaloUser.phone || "");
  if (normalizedLoginPhone) {
    try {
      const { getMember } = require("../foodbook");
      const memberResult = await getMember(normalizedLoginPhone).catch(() => null);
      if (memberResult?.success && memberResult?.data?.data) {
        crmMemberData = memberResult.data.data;
      }
    } catch(e) {}
  }

  const crmName = cleanDisplayName(crmMemberData?.name);
  const zaloName = cleanDisplayName(zaloUser.name);
  zaloUser.name = pickDisplayName(crmName, zaloName);

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
          name: pickDisplayName(crmMemberData?.name, zaloUser.name, customer.name) || "Cing iu",
          birthday: zaloUser.birthday || "",
        });
        console.log("[AUTH] iPOS member created for:", customer.phone);
      } else {
        crmMemberData = existing.data.data || crmMemberData;
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
      const displayName = pickDisplayName(
        playerData?.display_name,
        crmMemberData?.name,
        playerData?.zalo_name,
        zaloUser.name,
        customer.name
      );
      if (displayName) {
        customer.name = displayName;
      }
    }
  } catch(e) { console.warn("[AUTH] read player avatar failed:", e.message); }

  // National Day 2026 campaign:
  // mọi member login trong campaign được tạo đúng một quà chờ nhận +29 điểm
  // theo player và installation. Login không cộng điểm và không sync iPOS.
  if (customer.phone) {
    try {
      await claimNationalDayLoginReward({
        phone: customer.phone,
        installationId:
          zaloUser.installation_id ||
          zaloUser.installationId ||
          "",
        source:
          zaloUser.source ||
          "zalo-miniapp",
      });
    } catch (error) {
      logger.warn("National Day login reward processing failed", {
        customerId: customer.id,
        phone: customer.phone,
        error,
      });
    }
  }

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

  customer.name = pickDisplayName(customer.name, crmMemberData?.name, zaloUser.name) || "Cing iu";

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

  customer.name =
    pickDisplayName(
      customer.name
    ) ||
    "Cing iu";

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
 * AUTHENTICATED SESSION ENTRY
 * =====================================================
 */

async function evaluateAuthenticatedSessionEntry({
  customer,
  installationId = "",
  source = "zalo-miniapp-session",
}) {

  if (
    !customer ||
    !customer.phone
  ) {
    return {
      reward_granted: false,
      skipped: true,
      reason:
        "customer_phone_missing",
    };
  }

  try {

    return await claimNationalDayLoginReward({
      phone:
        customer.phone,

      installationId:
        String(
          installationId || ""
        ).trim(),

      source:
        String(
          source ||
          "zalo-miniapp-session"
        ).trim() ||
        "zalo-miniapp-session",
    });

  } catch (error) {

    /*
     * Campaign evaluation must never break an otherwise
     * valid authenticated app session.
     *
     * PostgreSQL remains the final atomic/idempotent
     * reward authority.
     */
    logger.warn(
      "Authenticated session campaign evaluation failed",
      {
        customerId:
          customer.id,

        phone:
          customer.phone,

        error,
      }
    );

    return {
      reward_granted: false,
      skipped: true,
      reason:
        "campaign_processing_failed",
    };

  }

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
  evaluateAuthenticatedSessionEntry,
  logout,

};