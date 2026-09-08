"use strict";

const {
  verifyDeliveryLocationCandidate,
} = require(
  "./deliveryLocationCandidateService"
);

const {
  normalizeDeliveryLocation,
  isDeliveryOrderType,
} = require(
  "./deliveryLocationAuthorityService"
);


async function resolveFinalDeliveryDestination({
  user_id,
  order_type,
  gps_latitude,
  gps_longitude,
  gps_location_source,
  address_detail,
  candidate_token,
}) {
  if (
    !isDeliveryOrderType(
      order_type
    )
  ) {
    return {
      location:
        normalizeDeliveryLocation({
          order_type,
        }),

      shipping: {
        success:
          true,

        shipping_fee:
          0,

        distance_km:
          null,

        free_shipping:
          false,

        authority:
          "non_delivery",
      },

      selected_destination:
        "non_delivery",

      candidate_authority:
        null,
    };
  }

  let latitude =
    gps_latitude;

  let longitude =
    gps_longitude;

  let locationSource =
    gps_location_source ||
    "unknown";

  let selectedDestination =
    "current_location";

  let canonicalAddressDetail =
    address_detail;

  let candidateAuthority =
    null;

  if (
    candidate_token
  ) {
    const candidate =
      verifyDeliveryLocationCandidate(
        candidate_token,
        {
          expected_user_id:
            user_id,
        }
      );

    latitude =
      candidate.latitude;

    longitude =
      candidate.longitude;

    locationSource =
      "typed_address_geocode";

    selectedDestination =
      "typed_address";

    canonicalAddressDetail =
      candidate.address_text ||
      address_detail;

    const hasRouteDistance =
      candidate
        .route_distance_meters !==
          null &&
      candidate
        .route_distance_meters !==
          undefined;

    const hasRouteDuration =
      candidate
        .route_duration_seconds !==
          null &&
      candidate
        .route_duration_seconds !==
          undefined;

    const routeDistanceMeters =
      hasRouteDistance
        ? Number(
            candidate
              .route_distance_meters
          )
        : null;

    const routeDurationSeconds =
      hasRouteDuration
        ? Number(
            candidate
              .route_duration_seconds
          )
        : null;

    const hasSignedRouteSnapshot =
      hasRouteDistance &&
      hasRouteDuration &&
      Number.isInteger(
        routeDistanceMeters
      ) &&
      routeDistanceMeters >= 0 &&
      Number.isInteger(
        routeDurationSeconds
      ) &&
      routeDurationSeconds >= 0;

    candidateAuthority = {
      jti:
        candidate.jti,

      user_id:
        candidate.user_id,

      exp:
        candidate.exp,

      route_snapshot:
        hasSignedRouteSnapshot
          ? {
              distance_meters:
                routeDistanceMeters,

              duration_seconds:
                routeDurationSeconds,

              provider:
                String(
                  candidate
                    .route_provider ||
                  "google_routes_v2"
                ),
            }
          : null,
    };
  }

  const location =
    normalizeDeliveryLocation({
      order_type,

      latitude,

      longitude,

      address_detail:
        canonicalAddressDetail,

      location_source:
        locationSource,
    });

  /*
   * CRITICAL:
   *
   * This service selects coordinates only.
   *
   * Shipping fee is NOT calculated here because this layer
   * does not own canonical order amount.
   *
   * Candidate verification is non-mutating. Durable replay
   * consumption occurs only after canonical checkout validation
   * succeeds and before payment transaction creation.
   */
  return {
    location,

    selected_destination:
      selectedDestination,

    candidate_authority:
      candidateAuthority,
  };
}


module.exports = {
  resolveFinalDeliveryDestination,
};
