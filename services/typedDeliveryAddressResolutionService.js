"use strict";

const {
  geocodeDeliveryAddress,
  normalizeAddressText,
} = require(
  "./shippingAddressGeocodingService"
);

const {
  calculateDistance,
  calculateShippingFee,
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

  const geocoded =
    await geocodeDeliveryAddress({
      address:
        addressText,
    });

  const mismatchDistanceKm =
    calculateDistance({
      origin_latitude:
        currentLat,

      origin_longitude:
        currentLng,

      destination_latitude:
        geocoded.latitude,

      destination_longitude:
        geocoded.longitude,
    });

  const shipping =
    await calculateShippingFee({
      destination_latitude:
        geocoded.latitude,

      destination_longitude:
        geocoded.longitude,

      total_amount:
        Number(
          order_amount
        ) || 0,
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
        "Không thể giao tới địa chỉ đã nhập",

      formatted_address:
        geocoded.formatted_address,

      candidate_latitude:
        geocoded.latitude,

      candidate_longitude:
        geocoded.longitude,

      mismatch_distance_km:
        mismatchDistanceKm,
    };
  }

  const candidateToken =
    createDeliveryLocationCandidate({
      user_id:
        canonicalUserId,

      latitude:
        geocoded.latitude,

      longitude:
        geocoded.longitude,

      formatted_address:
        geocoded.formatted_address,

      address_text:
        addressText,

      place_id:
        geocoded.place_id,

      shipping_distance_km:
        shipping.distance_km,

      shipping_fee:
        shipping.shipping_fee,
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
      geocoded.formatted_address,

    candidate_latitude:
      geocoded.latitude,

    candidate_longitude:
      geocoded.longitude,

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
