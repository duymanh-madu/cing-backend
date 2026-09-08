"use strict";

const {
  resolveDrivingRouteFromPlaceId,
} = require(
  "./shippingRoadRouteService"
);

const {
  getSelectedDeliveryPlaceDetails,
} = require(
  "./googlePlacesDeliveryAutocompleteService"
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
  const number =
    Number(value);

  if (
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


async function resolveSelectedDeliveryPlace({
  user_id,
  place_id,
  session_token,
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

  const placeId =
    String(
      place_id || ""
    ).trim();

  if (
    placeId.length < 5 ||
    placeId.length > 300
  ) {
    throw resolutionError(
      "DELIVERY_ADDRESS_PLACE_ID_INVALID",
      "Địa điểm giao hàng không hợp lệ"
    );
  }

  /*
   * Place Details terminates the Autocomplete session and owns the
   * canonical human-readable address. It does NOT own road distance.
   */
  /*
   * Place Details must receive the Autocomplete-selected alias.
   *
   * Google may canonicalize that alias and return a different
   * provider-owned place_id. Only after Details succeeds does
   * canonicalPlaceId exist and become downstream Routes/candidate
   * authority.
   */
  const placeDetails =
    await getSelectedDeliveryPlaceDetails({
      place_id:
        placeId,

      session_token,
    });

  const canonicalPlaceId =
    placeDetails.place_id;

  const canonicalAddress =
    placeDetails.formatted_address;


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
   * Selected Google Places placeId is the destination identity.
   *
   * Routes DRIVE owns road-distance authority directly from that
   * placeId. Frontend never supplies destination coordinates.
   */
  const route =
    await resolveDrivingRouteFromPlaceId({
      origin_latitude:
        originLat,

      origin_longitude:
        originLng,

      destination_place_id:
        canonicalPlaceId,
    });

  /*
   * Current GPS is advisory only.
   *
   * Routes owns the selected destination endpoint. Haversine compares
   * current device position with that endpoint for sanity/presentation;
   * it never prices shipping.
   */
  if (
    !Number.isFinite(
      Number(route.latitude)
    ) ||
    !Number.isFinite(
      Number(route.longitude)
    )
  ) {
    throw resolutionError(
      "DELIVERY_SELECTED_PLACE_ENDPOINT_REQUIRED",
      "Không xác định được điểm giao hàng chính xác"
    );
  }

  const destinationLat =
    Number(route.latitude);

  const destinationLng =
    Number(route.longitude);

  const mismatchDistanceKm =
    calculateDistance({
      origin_latitude:
        currentLat,

      origin_longitude:
        currentLng,

      destination_latitude:
        destinationLat,

      destination_longitude:
        destinationLng,
    });

  const shipping =
    await calculateShippingFee({
      destination_latitude:
        destinationLat,

      destination_longitude:
        destinationLng,

      total_amount:
        Number(
          order_amount
        ) || 0,

      route_snapshot: {
        distance_meters:
          route.distance_meters,

        duration_seconds:
          route.duration_seconds,

        provider:
          route.provider,
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
        "Không thể giao tới địa chỉ đã chọn",

      formatted_address:
        canonicalAddress,
    };
  }

  const candidateToken =
    createDeliveryLocationCandidate({
      user_id:
        canonicalUserId,

      latitude:
        destinationLat,

      longitude:
        destinationLng,

      formatted_address:
        canonicalAddress,

      address_text:
        canonicalAddress,

      place_id:
        canonicalPlaceId,

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
      canonicalAddress,

    candidate_latitude:
      destinationLat,

    candidate_longitude:
      destinationLng,

    shipping_distance_km:
      shipping.distance_km,

    shipping_fee:
      shipping.shipping_fee,

    free_shipping:
      shipping.free_shipping,

    manual_shipping_quote_required:
      shipping
        .manual_shipping_quote_required ===
      true,

    shipping_quote_note:
      shipping.shipping_quote_note ||
      null,

    address_match_partial:
      false,

    candidate_token:
      candidateToken,
  };
}


module.exports = {
  resolveSelectedDeliveryPlace,
};
