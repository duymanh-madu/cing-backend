const supabase =
  require("../supabase");

const {
  validateVoucher,
} = require(
  "./voucherService"
);

const {
  calculateShippingFee,
} = require(
  "./shippingService"
);

const {
  calculateOrderDiscount,
} = require(
  "./membershipBenefitsService"
);

const {
  resolveCanonicalMerchandisePricing,
} = require(
  "./commerce/canonicalMerchandisePricingService"
);

const {
  resolveCanonicalPointRedemption,
} = require(
  "./commerce/canonicalPointRedemptionService"
);

/**
 * ============================================
 * GET APP CONFIG
 * ============================================
 */

async function getAppConfig() {

  const {

    data,
    error,

  } = await supabase

    .from("app_configs")

    .select("*")

    .order("id", {

      ascending: false,

    })

    .limit(1)

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  if (!data) {

    throw new Error(
      "App config not found"
    );

  }

  return data;

}

/**
 * ============================================
 * VALIDATE COORDINATES
 * ============================================
 */

function validateCoordinates({

  latitude,
  longitude,

}) {

  if (

    latitude === undefined ||
    longitude === undefined

  ) {

    return false;

  }

  if (

    isNaN(latitude) ||
    isNaN(longitude)

  ) {

    return false;

  }

  if (

    Number(latitude) < -90 ||
    Number(latitude) > 90

  ) {

    return false;

  }

  if (

    Number(longitude) < -180 ||
    Number(longitude) > 180

  ) {

    return false;

  }

  return true;

}

/**
 * ============================================
 * CANONICAL MERCHANDISE VALIDATION
 * ============================================
 *
 * Product identity, availability, quantity,
 * customization relationship and all prices are
 * resolved by the iPOS-synced catalog authority.
 *
 * Client item.price is presentation-only.
 */

/**
 * ============================================
 * VALIDATE CHECKOUT
 * ============================================
 */

async function resolveCanonicalCommerceTier(
  user_id
) {
  if (!user_id) {
    return "member";
  }

  const {
    data: player,
    error,
  } = await supabase
    .from("players")
    .select("crm_tier")
    .eq(
      "user_id",
      user_id
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `COMMERCE_TIER_LOOKUP_FAILED: ${error.message}`
    );
  }

  return String(
    player?.crm_tier ||
      "member"
  )
    .trim()
    .toLowerCase();
}

async function validateCheckout({

  user_id,

  items = [],

  voucher_code = null,

  payment_method,

  points_requested = 0,

  order_type = "delivery",
  destination_latitude,

  destination_longitude,

  submitted_shipping_fee = null,

  submitted_total_amount = null,

}) {

  /**
   * ============================================
   * CONFIG
   * ============================================
   */

  const config =
    await getAppConfig();

  /**
   * ============================================
   * APP STATUS
   * ============================================
   */

  if (
    config.app_status !==
    "active"
  ) {

    return {

      success: false,

      code:
        "APP_INACTIVE",

      message:
        "Ứng dụng đang tạm dừng",

    };

  }

  /**
   * ============================================
   * MAINTENANCE
   * ============================================
   */

  if (
    config.maintenance_mode
  ) {

    return {

      success: false,

      code:
        "MAINTENANCE_MODE",

      message:
        "Hệ thống đang bảo trì",

    };

  }

  /**
   * ============================================
   * ORDERING
   * ============================================
   */

  if (
    !config.ordering_enabled
  ) {

    return {

      success: false,

      code:
        "ORDERING_DISABLED",

      message:
        "Tạm thời không nhận đơn",

    };

  }

  /**
   * ============================================
   * PAYMENT ENABLED
   * ============================================
   */

  if (
    !config.payment_enabled
  ) {

    return {

      success: false,

      code:
        "PAYMENT_DISABLED",

      message:
        "Thanh toán đang tạm khóa",

    };

  }

  /**
   * ============================================
   * ORDER TYPE
   * ============================================
   */

  const normalizedOrderType =
    String(order_type || "")
      .trim()
      .toLowerCase();

  const requiresDelivery =
    normalizedOrderType ===
      "delivery";


  if (
    ![
      "delivery",
      "pickup",
      "dine_in",
    ].includes(
      normalizedOrderType
    )
  ) {

    return {

      success: false,

      code:
        "INVALID_ORDER_TYPE",

      message:
        "Loại đơn hàng không hợp lệ",

    };

  }


  /**
   * ============================================
   * DELIVERY AVAILABILITY
   * ============================================
   */

  if (
    requiresDelivery &&
    !config.delivery_enabled
  ) {

    return {

      success: false,

      code:
        "DELIVERY_DISABLED",

      message:
        "Giao hàng đang tạm khóa",

    };

  }


  /**
   * ============================================
   * DELIVERY COORDINATES
   * ============================================
   */

  if (
    requiresDelivery &&
    !validateCoordinates({

      latitude:
        destination_latitude,

      longitude:
        destination_longitude,

    })
  ) {

    return {

      success: false,

      code:
        "INVALID_COORDINATES",

      message:
        "Vị trí giao hàng không hợp lệ",

    };

  }


  /**
   * ============================================
   * CANONICAL MERCHANDISE
   * ============================================
   */

  let canonicalPricing;

  try {

    canonicalPricing =
      await resolveCanonicalMerchandisePricing({
        items,
      });

  } catch (error) {

    return {

      success: false,

      code:
        error.code ||
        "COMMERCE_PRICING_FAILED",

      message:
        "Sản phẩm hoặc tuỳ chọn không hợp lệ",

    };

  }


  const canonicalItems =
    canonicalPricing.items;

  const subtotal =
    canonicalPricing.subtotal;


  /**
   * ============================================
   * PAYMENT METHOD
   * ============================================
   */

  const allowedMethods =

    Array.isArray(

      config.allowed_payment_methods

    )

      ? config.allowed_payment_methods

      : [

          "bank_transfer",

          "momo",

        ];

  if (

    !allowedMethods.includes(
      payment_method
    )

  ) {

    return {

      success: false,

      code:
        "INVALID_PAYMENT_METHOD",

      message:
        "Phương thức thanh toán không hợp lệ",

    };

  }

  /**
   * ============================================
   * MINIMUM ORDER
   * ============================================
   */

  if (

    subtotal <

    Number(
      config.minimum_order_amount || 0
    )

  ) {

    return {

      success: false,

      code:
        "MINIMUM_ORDER_NOT_REACHED",

      message:

        `Đơn tối thiểu là ${Number(config.minimum_order_amount || 0).toLocaleString()}đ`,

    };

  }

  /**
   * ============================================
   * SHIPPING
   * ============================================
   */

  const shippingResult =
    requiresDelivery
      ? await calculateShippingFee({
          total_amount:
            subtotal,
          destination_latitude,
          destination_longitude,
        })
      : {
          success: true,
          shipping_fee: 0,
          distance_km: null,
          free_shipping: true,
          duration_text: null,
          distance_text: null,
          authority:
            "non_delivery",
        };

  if (
    !shippingResult.success
  ) {

    return shippingResult;

  }

  /**
   * ============================================
   * VOUCHER
   * ============================================
   */

  let voucher_discount = 0;

  let validated_voucher =
    null;

  if (voucher_code) {

    const voucherResult =

      await validateVoucher({

        user_id,

        voucher_code,

        subtotal,

        payment_method,

      });

    if (

      !voucherResult.success

    ) {

      return {

        success: false,

        code:
          "INVALID_VOUCHER",

        message:
          voucherResult.message,

      };

    }

    voucher_discount =

      Number(

        voucherResult.discount_amount || 0

      );

    validated_voucher =
      voucherResult;

  }

  /**
   * ============================================
   * TOTAL
   * ============================================
   */

  const tier_key =
    await resolveCanonicalCommerceTier(
      user_id
    );

  const {
    discount_amount:
      calculated_tier_discount,
  } = calculateOrderDiscount(
    subtotal,
    tier_key
  );

  const tier_discount =
    Number(
      calculated_tier_discount || 0
    );

  const pre_points_payable =

    Math.max(

      0,

      subtotal +

      Number(
        shippingResult.shipping_fee || 0
      ) -

      voucher_discount -

      tier_discount

    );


  let pointRedemption;

  try {

    pointRedemption =
      await resolveCanonicalPointRedemption({

        userId:
          user_id,

        requestedPoints:
          points_requested,

        prePointsPayable:
          pre_points_payable,

      });

  } catch (error) {

    return {

      success: false,

      code:
        error.code ||
        "COMMERCE_POINTS_PRICING_FAILED",

      message:
        "Số điểm sử dụng không hợp lệ",

    };

  }


  const points_used =
    pointRedemption.points_used;

  const point_value_vnd =
    pointRedemption.point_value_vnd;

  const points_discount =
    pointRedemption.points_discount;

  const remaining_payable =
    pointRedemption.remaining_payable;

  const expected_total_amount =
    remaining_payable;


  /**
   * ============================================
   * SHIPPING CONSISTENCY
   * ============================================
   */

  if (
    submitted_shipping_fee !== null &&
    submitted_shipping_fee !== undefined &&
    Number(
      submitted_shipping_fee
    ) !==
    Number(
      shippingResult.shipping_fee
    )
  ) {

    return {

      success: false,

      code:
        "INVALID_SHIPPING_FEE",

      message:
        "Phí vận chuyển không hợp lệ",

      expected_shipping_fee:

        shippingResult.shipping_fee,

    };

  }

  /**
   * ============================================
   * TOTAL CONSISTENCY
   * ============================================
   */

  if (
    submitted_total_amount !== null &&
    submitted_total_amount !== undefined &&
    Number(
      submitted_total_amount
    ) !==
    Number(
      expected_total_amount
    )
  ) {

    return {

      success: false,

      code:
        "INVALID_TOTAL_AMOUNT",

      message:
        "Tổng tiền không hợp lệ",

      expected_total_amount,

    };

  }

  /**
   * ============================================
   * SUCCESS
   * ============================================
   */

  return {

    success: true,

    validated: true,

    order_type:
      normalizedOrderType,

    items:
      canonicalItems,

    subtotal,

    voucher_discount,

    tier_key,

    tier_discount,

    pre_points_payable,

    points_requested:
      Number(points_requested || 0),

    points_used,

    point_value_vnd,

    points_discount,

    remaining_payable,


    shipping_fee:

      shippingResult.shipping_fee,

    total_amount:
      expected_total_amount,

    validated_voucher,

    distance_km:

      shippingResult.distance_km,

    free_shipping:

      shippingResult.free_shipping,

    duration_text:

      shippingResult.duration_text,

    distance_text:

      shippingResult.distance_text,

  };

}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {

  validateCheckout,

};