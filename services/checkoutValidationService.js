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
 * CALCULATE SUBTOTAL
 * ============================================
 */

function calculateSubtotal(
  items = []
) {

  return items.reduce(

    (
      sum,
      item
    ) => {

      return (

        sum +

        Number(
          item.price || 0
        ) *

        Number(
          item.quantity || 0
        )

      );

    },

    0
  );

}

/**
 * ============================================
 * VALIDATE ITEMS
 * ============================================
 */

function validateItems(
  items = []
) {

  if (

    !Array.isArray(items) ||
    items.length === 0

  ) {

    return {

      success: false,

      code:
        "EMPTY_CART",

      message:
        "Giỏ hàng trống",

    };

  }

  for (const item of items) {

    if (

      !item.id &&
      !item.item_id

    ) {

      return {

        success: false,

        code:
          "INVALID_ITEM",

        message:
          "Thiếu item id",

      };

    }

    if (

      Number(item.quantity) <= 0

    ) {

      return {

        success: false,

        code:
          "INVALID_QUANTITY",

        message:
          "Số lượng không hợp lệ",

      };

    }

    if (

      Number(item.price) < 0

    ) {

      return {

        success: false,

        code:
          "INVALID_PRICE",

        message:
          "Giá sản phẩm không hợp lệ",

      };

    }

  }

  return {

    success: true,

  };

}

/**
 * ============================================
 * VALIDATE CHECKOUT
 * ============================================
 */

async function validateCheckout({

  user_id,

  items = [],

  voucher_code = null,

  payment_method,

  destination_latitude,

  destination_longitude,

  submitted_shipping_fee = 0,

  submitted_total_amount = 0,

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
   * DELIVERY ENABLED
   * ============================================
   */

  if (
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
   * ITEMS VALIDATION
   * ============================================
   */

  const itemValidation =
    validateItems(
      items
    );

  if (
    !itemValidation.success
  ) {

    return itemValidation;

  }

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
   * COORDINATES
   * ============================================
   */

  const validCoordinates =

    validateCoordinates({

      latitude:
        destination_latitude,

      longitude:
        destination_longitude,

    });

  if (!validCoordinates) {

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
   * SUBTOTAL
   * ============================================
   */

  const subtotal =
    calculateSubtotal(
      items
    );

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

    await calculateShippingFee({

      subtotal,

      destination_latitude,

      destination_longitude,

    });

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

  const expected_total_amount =

    Math.max(

      0,

      subtotal +

      Number(
        shippingResult.shipping_fee || 0
      ) -

      voucher_discount

    );

  /**
   * ============================================
   * SHIPPING CONSISTENCY
   * ============================================
   */

  if (

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

    subtotal,

    voucher_discount,

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