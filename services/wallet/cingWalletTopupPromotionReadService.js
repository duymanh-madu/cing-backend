const supabase =
  require("../../supabase");


function createPromotionReadError({
  message,
  code,
  statusCode,
  cause,
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  if (cause) {
    error.cause =
      cause;
  }

  return error;
}


function normalizeOptionalTimestamp(
  value
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const timestamp =
    String(value).trim();

  if (
    !timestamp ||
    Number.isNaN(
      Date.parse(timestamp)
    )
  ) {
    throw createPromotionReadError({
      message:
        "Dữ liệu chương trình nạp tiền không hợp lệ",

      code:
        "CING_WALLET_TOPUP_PROMOTION_DATA_INVALID",

      statusCode:
        500,
    });
  }

  return new Date(
    timestamp
  ).toISOString();
}


function normalizePositiveMoney(
  value
) {
  const raw =
    String(
      value ?? ""
    ).trim();

  if (
    !/^[1-9][0-9]*$/.test(
      raw
    )
  ) {
    throw createPromotionReadError({
      message:
        "Dữ liệu chương trình nạp tiền không hợp lệ",

      code:
        "CING_WALLET_TOPUP_PROMOTION_DATA_INVALID",

      statusCode:
        500,
    });
  }

  let parsed;

  try {
    parsed =
      BigInt(raw);
  } catch {
    throw createPromotionReadError({
      message:
        "Dữ liệu chương trình nạp tiền không hợp lệ",

      code:
        "CING_WALLET_TOPUP_PROMOTION_DATA_INVALID",

      statusCode:
        500,
    });
  }

  if (
    parsed >
      9223372036854775807n
  ) {
    throw createPromotionReadError({
      message:
        "Dữ liệu chương trình nạp tiền không hợp lệ",

      code:
        "CING_WALLET_TOPUP_PROMOTION_DATA_INVALID",

      statusCode:
        500,
    });
  }

  /*
   * VND values currently used by the application are safely
   * inside JavaScript's integer range.
   *
   * Fail closed instead of silently losing precision.
   */
  const numeric =
    Number(raw);

  if (
    !Number.isSafeInteger(
      numeric
    ) ||
    numeric <= 0
  ) {
    throw createPromotionReadError({
      message:
        "Dữ liệu chương trình nạp tiền vượt giới hạn hỗ trợ",

      code:
        "CING_WALLET_TOPUP_PROMOTION_AMOUNT_UNSAFE",

      statusCode:
        500,
    });
  }

  return numeric;
}


function inactivePromotion() {
  return {
    active: false,
    name: null,
    starts_at: null,
    ends_at: null,
    tiers: [],
  };
}


function projectCustomerTopupPromotion(
  promotion,
  now =
    new Date()
) {
  if (
    !promotion ||
    typeof promotion !==
      "object" ||
    Array.isArray(promotion)
  ) {
    throw createPromotionReadError({
      message:
        "Không đọc được chương trình nạp Cing Wallet",

      code:
        "CING_WALLET_TOPUP_PROMOTION_DATA_INVALID",

      statusCode:
        500,
    });
  }

  if (
    promotion.enabled !==
      true
  ) {
    return inactivePromotion();
  }

  const nowMs =
    now instanceof Date
      ? now.getTime()
      : Date.parse(now);

  if (
    !Number.isFinite(
      nowMs
    )
  ) {
    throw createPromotionReadError({
      message:
        "Không xác định được thời điểm chương trình",

      code:
        "CING_WALLET_TOPUP_PROMOTION_TIME_INVALID",

      statusCode:
        500,
    });
  }

  const startsAt =
    normalizeOptionalTimestamp(
      promotion.starts_at
    );

  const endsAt =
    normalizeOptionalTimestamp(
      promotion.ends_at
    );

  /*
   * Same temporal semantics as settlement authority:
   *
   * starts_at <= now
   * ends_at   > now
   */
  if (
    startsAt &&
    nowMs <
      Date.parse(startsAt)
  ) {
    return inactivePromotion();
  }

  if (
    endsAt &&
    nowMs >=
      Date.parse(endsAt)
  ) {
    return inactivePromotion();
  }

  if (
    !Array.isArray(
      promotion.tiers
    ) ||
    promotion.tiers.length === 0
  ) {
    /*
     * An enabled promotion without tiers should already be
     * impossible at DB authority, but customer projection still
     * fails closed.
     */
    return inactivePromotion();
  }

  const tiers =
    promotion.tiers
      .map(
        (tier) => {
          if (
            !tier ||
            typeof tier !==
              "object" ||
            Array.isArray(tier)
          ) {
            throw createPromotionReadError({
              message:
                "Dữ liệu chương trình nạp tiền không hợp lệ",

              code:
                "CING_WALLET_TOPUP_PROMOTION_DATA_INVALID",

              statusCode:
                500,
            });
          }

          return {
            min_topup_amount:
              normalizePositiveMoney(
                tier.min_topup_amount
              ),

            bonus_amount:
              normalizePositiveMoney(
                tier.bonus_amount
              ),
          };
        }
      )
      .sort(
        (
          left,
          right
        ) =>
          left.min_topup_amount -
          right.min_topup_amount
      );

  const name =
    typeof promotion.name ===
      "string"
      ? promotion.name.trim()
      : "";

  return {
    active: true,

    name:
      name || null,

    starts_at:
      startsAt,

    ends_at:
      endsAt,

    tiers,
  };
}


async function getCustomerTopupPromotion() {
  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_wallet_get_topup_promotion_v1"
  );

  if (error) {
    throw createPromotionReadError({
      message:
        "Không thể đọc chương trình nạp Cing Wallet",

      code:
        "CING_WALLET_TOPUP_PROMOTION_READ_FAILED",

      statusCode:
        500,

      cause:
        error,
    });
  }

  return projectCustomerTopupPromotion(
    data
  );
}


module.exports = {
  projectCustomerTopupPromotion,
  getCustomerTopupPromotion,
};
