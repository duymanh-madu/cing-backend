const supabase =
  require("../supabase");

/**
 * ============================================
 * DEFAULT CONFIG
 * ============================================
 */

const DEFAULT_CONFIG = {

  base_fee: 15000,

  fee_per_km: 5000,

  free_shipping_threshold:
    300000,

  max_distance_km: 15,

};

/**
 * ============================================
 * GET SHIPPING CONFIG
 * ============================================
 */

async function getShippingConfig() {

  try {

    const {

      data,

    } = await supabase

      .from("shipping_configs")

      .select("*")

      .order("id", {

        ascending: false,

      })

      .limit(1)

      .maybeSingle();

    return {

      ...DEFAULT_CONFIG,

      ...(data || {}),

    };

  } catch (error) {

    return DEFAULT_CONFIG;

  }

}

/**
 * ============================================
 * CALCULATE DISTANCE
 * ============================================
 */

function calculateDistance({

  origin_latitude,

  origin_longitude,

  destination_latitude,

  destination_longitude,

}) {

  const toRad =

    (value) =>

      (value * Math.PI) / 180;

  const R = 6371;

  const dLat =

    toRad(

      destination_latitude -
        origin_latitude

    );

  const dLon =

    toRad(

      destination_longitude -
        origin_longitude

    );

  const lat1 =
    toRad(origin_latitude);

  const lat2 =
    toRad(destination_latitude);

  const a =

    Math.sin(dLat / 2) *

      Math.sin(dLat / 2) +

    Math.sin(dLon / 2) *

      Math.sin(dLon / 2) *

      Math.cos(lat1) *

      Math.cos(lat2);

  const c =

    2 *

    Math.atan2(

      Math.sqrt(a),

      Math.sqrt(1 - a)

    );

  return Number(
    (R * c).toFixed(2)
  );

}

/**
 * ============================================
 * CALCULATE SHIPPING FEE
 * ============================================
 */

async function calculateShippingFee({

  total_amount = 0,

  origin_latitude =
    21.121421,

  origin_longitude =
    106.051239,

  destination_latitude,

  destination_longitude,

}) {

  const config =
    await getShippingConfig();

  if (

    !destination_latitude ||

    !destination_longitude

  ) {

    return {

      success: false,

      code:
        "INVALID_LOCATION",

      message:
        "Thiếu vị trí giao hàng",

    };

  }

  const distance_km =

    calculateDistance({

      origin_latitude,

      origin_longitude,

      destination_latitude,

      destination_longitude,

    });

  if (

    distance_km >

    Number(
      config.max_distance_km
    )

  ) {

    return {

      success: false,

      code:
        "OUT_OF_DELIVERY_RANGE",

      message:
        "Ngoài phạm vi giao hàng",

      distance_km,

    };

  }

  let shipping_fee =

    Number(
      config.base_fee
    ) +

    distance_km *

      Number(
        config.fee_per_km
      );

  let free_shipping =
    false;

  if (

    total_amount >=

    Number(
      config.free_shipping_threshold
    )

  ) {

    shipping_fee = 0;

    free_shipping = true;

  }

  shipping_fee =
    Math.round(shipping_fee);

  return {

    success: true,

    shipping_fee,

    distance_km,

    free_shipping,

    duration_text:

      `${Math.ceil(distance_km * 3)} phút`,

    distance_text:
      `${distance_km} km`,

  };

}

module.exports = {

  calculateShippingFee,

  calculateDistance,

};