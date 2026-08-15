const supabase =
  require("../../supabase");

const customerRepository =
  require(
    "../../repositories/customer/customerRepository"
  );

const {
  normalizePhone,
} = require(
  "../../utils/phoneIdentity"
);

const {
  claimNationalDayLoginReward,
} = require(
  "./nationalDayLoginRewardService"
);

function normalizeZaloId(
  value
) {
  return String(
    value || ""
  ).trim();
}

async function resolveCanonicalCachedMember({
  phone,
  zaloUserId,
}) {
  const normalizedPhone =
    normalizePhone(
      phone || ""
    );

  const normalizedZaloId =
    normalizeZaloId(
      zaloUserId
    );

  if (
    !normalizedPhone ||
    normalizedPhone.length < 9 ||
    !normalizedZaloId
  ) {
    return null;
  }

  const [
    customerByPhone,
    customerByZaloId,
  ] = await Promise.all([
    customerRepository
      .findByPhone(
        normalizedPhone
      ),

    customerRepository
      .findByZaloId(
        normalizedZaloId
      ),
  ]);

  if (
    !customerByPhone?.id ||
    !customerByZaloId?.id ||
    customerByPhone.id !==
      customerByZaloId.id
  ) {
    return null;
  }

  if (
    normalizePhone(
      customerByPhone.phone || ""
    ) !== normalizedPhone ||
    normalizeZaloId(
      customerByPhone.zalo_id
    ) !== normalizedZaloId
  ) {
    return null;
  }

  const {
    data: player,
    error,
  } = await supabase
    .from("players")
    .select(
      "user_id, phone, zalo_user_id, member_activated"
    )
    .eq(
      "user_id",
      normalizedPhone
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `cached_member_player_lookup: ${error.message}`
    );
  }

  if (
    !player ||
    player.member_activated !== true
  ) {
    return null;
  }

  if (
    player.phone &&
    normalizePhone(
      player.phone
    ) !== normalizedPhone
  ) {
    return null;
  }

  if (
    player.zalo_user_id &&
    normalizeZaloId(
      player.zalo_user_id
    ) !== normalizedZaloId
  ) {
    return null;
  }

  return {
    phone:
      normalizedPhone,

    zaloUserId:
      normalizedZaloId,
  };
}

async function evaluateCachedMemberAppOpen({
  phone,
  zaloUserId,
  installationId = "",
  source = "zalo-miniapp-shell-cache",
}) {
  const member =
    await resolveCanonicalCachedMember({
      phone,
      zaloUserId,
    });

  if (!member) {
    return {
      accepted: false,
    };
  }

  await claimNationalDayLoginReward({
    phone:
      member.phone,

    installationId:
      String(
        installationId || ""
      ).trim(),

    source:
      String(
        source ||
        "zalo-miniapp-shell-cache"
      ).trim() ||
      "zalo-miniapp-shell-cache",
  });

  return {
    accepted: true,
  };
}

module.exports = {
  evaluateCachedMemberAppOpen,
  resolveCanonicalCachedMember,
};
