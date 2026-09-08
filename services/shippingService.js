const supabase =
  require("../supabase");

const {
  resolveDrivingRoute,
} = require(
  "./shippingRoadRouteService"
);

/**
 * ============================================
 * GET SHIPPING CONFIG
 * ============================================
 */

async function getShippingConfig() {
  const {
    data,
    error,
  } = await supabase
    .from("app_configs")
    .select(
      [
        "store_latitude",
        "store_longitude",
        "max_delivery_distance",
        "shipping_tiers",
        "shipping_fee_per_km",
        "free_shipping_threshold",
      ].join(",")
    )
    .eq("id", 1)
    .single();

  if (error) {
    throw new Error(
      `SHIPPING_CONFIG_LOOKUP_FAILED: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      "SHIPPING_CONFIG_NOT_FOUND"
    );
  }

  return data;
}

function resolveTierFee({
  tiers = [],
  distance_km,
  total_amount,
}) {
  if (!Array.isArray(tiers)) {
    return null;
  }

  const tier = tiers.find((item) => {
    const minKm =
      Number(item?.min_km ?? 0);

    const maxKm =
      Number(item?.max_km ?? Infinity);

    const minOrder =
      Number(item?.min_order ?? 0);

    const maxOrder =
      Number(
        item?.max_order ??
        Number.MAX_SAFE_INTEGER
      );

    return (
      distance_km >= minKm &&
      distance_km <= maxKm &&
      total_amount >= minOrder &&
      total_amount <= maxOrder
    );
  });

  if (!tier) {
    return null;
  }

  return Math.round(
    Number(tier.base_fee || 0) +
    (
      Number(tier.fee_per_km || 0) *
      distance_km
    )
  );
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
  destination_latitude,
  destination_longitude,
  route_snapshot = null,
}) {
  const config =
    await getShippingConfig();

  const hasDestinationLatitude =
    destination_latitude !== null &&
    destination_latitude !== undefined &&
    String(destination_latitude).trim() !== "";

  const hasDestinationLongitude =
    destination_longitude !== null &&
    destination_longitude !== undefined &&
    String(destination_longitude).trim() !== "";

  const destinationLat =
    Number(destination_latitude);

  const destinationLng =
    Number(destination_longitude);

  if (
    !hasDestinationLatitude ||
    !hasDestinationLongitude ||
    !Number.isFinite(destinationLat) ||
    !Number.isFinite(destinationLng) ||
    destinationLat < -90 ||
    destinationLat > 90 ||
    destinationLng < -180 ||
    destinationLng > 180
  ) {
    return {
      success: false,
      code: "INVALID_LOCATION",
      message: "Thiếu vị trí giao hàng",
    };
  }

  const originLat =
    Number(config.store_latitude);

  const originLng =
    Number(config.store_longitude);

  if (
    !Number.isFinite(originLat) ||
    !Number.isFinite(originLng)
  ) {
    throw new Error(
      "SHIPPING_STORE_COORDINATES_INVALID"
    );
  }

  const suppliedRouteSnapshot =
    route_snapshot;

  let route;

  if (suppliedRouteSnapshot) {
    const distanceMeters =
      Number(
        suppliedRouteSnapshot
          .distance_meters
      );

    const durationSeconds =
      Number(
        suppliedRouteSnapshot
          .duration_seconds
      );

    if (
      !Number.isInteger(
        distanceMeters
      ) ||
      distanceMeters < 0 ||
      !Number.isInteger(
        durationSeconds
      ) ||
      durationSeconds < 0
    ) {
      throw new Error(
        "DELIVERY_ROUTE_SNAPSHOT_INVALID"
      );
    }

    route = {
      distance_meters:
        distanceMeters,

      distance_km:
        distanceMeters / 1000,

      duration_seconds:
        durationSeconds,

      provider:
        String(
          suppliedRouteSnapshot
            .provider ||
          "signed_candidate"
        ),

      travel_mode:
        "DRIVE",
    };
  } else {
    route =
      await resolveDrivingRoute({
        origin_latitude:
          originLat,

        origin_longitude:
          originLng,

        destination_latitude:
          destinationLat,

        destination_longitude:
          destinationLng,
      });
  }

  const distance_km =
    route.distance_km;

  const duration_text =
    route.duration_seconds === 0
      ? "0 phút"
      : `${Math.max(
          1,
          Math.ceil(
            route.duration_seconds /
            60
          )
        )} phút`;

  const distance_text =
    `${Number(
      distance_km.toFixed(2)
    )} km`;

  const maxDistance =
    Number(
      config.max_delivery_distance
    );

  if (
    Number.isFinite(maxDistance) &&
    distance_km > maxDistance
  ) {
    return {
      success: false,
      code: "OUT_OF_DELIVERY_RANGE",
      message: "Ngoài phạm vi giao hàng",
      distance_km,
    };
  }

  const normalizedTotal =
    Number(total_amount || 0);

  const tierFee =
    resolveTierFee({
      tiers:
        config.shipping_tiers || [],
      distance_km,
      total_amount:
        normalizedTotal,
    });

  if (tierFee !== null) {
    return {
      success: true,
      shipping_fee:
        tierFee,
      distance_km,
      free_shipping:
        tierFee === 0,
      duration_text,
      distance_text,
      route_distance_meters:
        route.distance_meters,
      route_duration_seconds:
        route.duration_seconds,
      route_provider:
        route.provider,
      authority:
        "app_configs.shipping_tiers",
    };
  }

  const freeThreshold =
    Number(
      config.free_shipping_threshold ||
      0
    );

  if (
    freeThreshold > 0 &&
    normalizedTotal >= freeThreshold
  ) {
    return {
      success: true,
      shipping_fee: 0,
      distance_km,
      free_shipping: true,
      duration_text,
      distance_text,
      route_distance_meters:
        route.distance_meters,
      route_duration_seconds:
        route.duration_seconds,
      route_provider:
        route.provider,
      authority:
        "app_configs.free_shipping_threshold",
    };
  }

  const feePerKm =
    Number(
      config.shipping_fee_per_km ||
      0
    );

  const shipping_fee =
    Math.round(
      distance_km * feePerKm
    );

  return {
    success: true,
    shipping_fee,
    distance_km,
    free_shipping:
      shipping_fee === 0,
    duration_text,
    distance_text,
    route_distance_meters:
      route.distance_meters,
    route_duration_seconds:
      route.duration_seconds,
    route_provider:
      route.provider,
    authority:
      "app_configs.shipping_fee_per_km",
  };
}

module.exports = {

  calculateShippingFee,

  calculateDistance,

  getShippingConfig,
  resolveTierFee,

};