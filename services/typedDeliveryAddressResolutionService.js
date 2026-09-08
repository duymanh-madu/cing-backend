"use strict";

const {
  normalizeAddressText,
  resolveDrivingRouteFromAddress,
} = require(
  "./shippingRoadRouteService"
);

const {
  calculateDistance,
  calculateShippingFee,
  getShippingConfig,
} = require(
  "./shippingService"
);

const {
  createDeliveryLocationCandidate,
} = require(
  "./deliveryLocationCandidateService"
);


const MISMATCH_THRESHOLD_KM =
  0.2;


function resolutionError(
  code,
  message = code
) {
  const error =
    new Error(message);

  error.code =
    code;

  return error;
}


function normalizeCoordinate(
  value,
  min,
  max,
  code
) {
  const present =
    value !== null &&
    value !== undefined &&
    String(value).trim() !== "";

  const number =
    Number(value);

  if (
    !present ||
    !Number.isFinite(number) ||
    number < min ||
    number > max
  ) {
    throw resolutionError(
      code
    );
  }

  return number;
}


function normalizeUserId(
  value
) {
  const userId =
    String(
      value || ""
    ).trim();

  if (!userId) {
    throw resolutionError(
      "DELIVERY_CUSTOMER_IDENTITY_REQUIRED"
    );
  }

  return userId;
}


async function resolveTypedDeliveryAddress({
  user_id,
  address_text,
  current_latitude,
  current_longitude,
  order_amount,
}) {
  const canonicalUserId =
    normalizeUserId(
      user_id
    );

  const currentLat =
    normalizeCoordinate(
      current_latitude,
      -90,
      90,
      "CURRENT_DELIVERY_LATITUDE_INVALID"
    );

  const currentLng =
    normalizeCoordinate(
      current_longitude,
      -180,
      180,
      "CURRENT_DELIVERY_LONGITUDE_INVALID"
    );

  const addressText =
    normalizeAddressText(
      address_text
    );

  /*
   * Store origin remains backend-owned through app_configs.
   */
  const shippingConfig =
    await getShippingConfig();

  const originLat =
    Number(
      shippingConfig
        .store_latitude
    );

  const originLng =
    Number(
      shippingConfig
        .store_longitude
    );

  if (
    !Number.isFinite(originLat) ||
    !Number.isFinite(originLng) ||
    originLat < -90 ||
    originLat > 90 ||
    originLng < -180 ||
    originLng > 180
  ) {
    throw resolutionError(
      "SHIPPING_STORE_COORDINATES_INVALID"
    );
  }

  /*
   * SINGLE PROVIDER CALL.
   *
   * Google Routes owns all provider work for typed addresses:
   * - address resolution
   * - provider place id / type
   * - canonical route endpoint
   * - DRIVE distance
   * - DRIVE duration
   *
   * Google Geocoding API is intentionally retired from this
   * executable production path.
   */
  const routeAddress =
    await resolveDrivingRouteFromAddress({
      origin_latitude:
        originLat,

      origin_longitude:
        originLng,

      destination_address:
        addressText,
    });

  /*
   * Haversine is sanity-only.
   *
   * It compares the device GPS location to the provider-resolved
   * destination. It never prices shipping and never determines
   * delivery range.
   */
  const mismatchDistanceKm =
    calculateDistance({
      origin_latitude:
        currentLat,

      origin_longitude:
        currentLng,

      destination_latitude:
        routeAddress.latitude,

      destination_longitude:
        routeAddress.longitude,
    });

  /*
   * Reuse the exact Google Routes snapshot.
   *
   * calculateShippingFee remains canonical for DB-owned tiers,
   * max range and free-shipping policy, but must NOT call Google
   * Routes a second time for this typed-address quote.
   *
   * order_amount here is quote-only. Checkout later recalculates
   * against canonical backend merchandise pricing.
   */
  const shipping =
    await calculateShippingFee({
      destination_latitude:
        routeAddress.latitude,

      destination_longitude:
        routeAddress.longitude,

      total_amount:
        Number(
          order_amount
        ) || 0,

      route_snapshot: {
        distance_meters:
          routeAddress
            .distance_meters,

        duration_seconds:
          routeAddress
            .duration_seconds,

        provider:
          routeAddress
            .provider,
      },
    });

  if (
    shipping.success !== true
  ) {
    return {
      success:
        false,

      code:
        shipping.code ||
        "DELIVERY_ADDRESS_SHIPPING_UNAVAILABLE",

      error:
        shipping.error ||
        shipping.message ||
        "Không thể giao tới địa chỉ đã nhập",

      formatted_address:
        routeAddress
          .formatted_address,

      candidate_latitude:
        routeAddress.latitude,

      candidate_longitude:
        routeAddress.longitude,

      mismatch_distance_km:
        mismatchDistanceKm,
    };
  }

  /*
   * Signed capability freezes:
   * - authenticated customer
   * - canonical route endpoint
   * - provider place id
   * - road-distance snapshot
   * - route duration snapshot
   *
   * Signed shipping_fee remains informational only; checkout
   * recalculates monetary authority from canonical subtotal.
   */
  const candidateToken =
    createDeliveryLocationCandidate({
      user_id:
        canonicalUserId,

      latitude:
        routeAddress.latitude,

      longitude:
        routeAddress.longitude,

      formatted_address:
        routeAddress
          .formatted_address,

      address_text:
        addressText,

      place_id:
        routeAddress.place_id,

      shipping_distance_km:
        shipping.distance_km,

      shipping_fee:
        shipping.shipping_fee,

      route_distance_meters:
        shipping
          .route_distance_meters,

      route_duration_seconds:
        shipping
          .route_duration_seconds,

      route_provider:
        shipping
          .route_provider,
    });

  return {
    success:
      true,

    mismatch:
      mismatchDistanceKm >
      MISMATCH_THRESHOLD_KM,

    mismatch_threshold_km:
      MISMATCH_THRESHOLD_KM,

    mismatch_distance_km:
      mismatchDistanceKm,

    formatted_address:
      routeAddress
        .formatted_address,

    candidate_latitude:
      routeAddress.latitude,

    candidate_longitude:
      routeAddress.longitude,

    shipping_distance_km:
      shipping.distance_km,

    shipping_fee:
      shipping.shipping_fee,

    free_shipping:
      shipping.free_shipping,

    candidate_token:
      candidateToken,
  };
}


module.exports = {
  MISMATCH_THRESHOLD_KM,
  resolveTypedDeliveryAddress,
};
