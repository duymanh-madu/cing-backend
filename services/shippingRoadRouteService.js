"use strict";

const axios =
  require("axios");

const GOOGLE_ROUTES_ENDPOINT =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

const ROUTES_FIELD_MASK =
  "routes.distanceMeters,routes.duration";


const ROUTES_PLACE_ID_FIELD_MASK =
  [
    "routes.distanceMeters",
    "routes.duration",
    "routes.legs.endLocation",
  ].join(",");

const ROUTES_ADDRESS_FIELD_MASK =
  [
    "routes.distanceMeters",
    "routes.duration",
    "routes.legs.endLocation",
    "geocodingResults",
  ].join(",");

const DELIVERY_CAPABLE_TYPES =
  new Set([
    "street_address",
    "subpremise",
    "premise",
    "establishment",
    "point_of_interest",
    "intersection",
  ]);

function routeError(
  code,
  message = code,
  statusCode = 503
) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

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
    throw routeError(
      code,
      code,
      400
    );
  }

  return number;
}

function parseDurationSeconds(
  value
) {
  const raw =
    String(value || "").trim();

  const match =
    raw.match(
      /^(\d+(?:\.\d+)?)s$/
    );

  if (!match) {
    throw routeError(
      "DELIVERY_ROUTES_DURATION_INVALID"
    );
  }

  const seconds =
    Number(match[1]);

  if (
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    throw routeError(
      "DELIVERY_ROUTES_DURATION_INVALID"
    );
  }

  return Math.ceil(seconds);
}

function normalizeAddressText(
  value
) {
  const address =
    String(
      value || ""
    )
      .trim()
      .replace(
        /\s+/g,
        " "
      );

  if (
    address.length < 5 ||
    address.length > 500
  ) {
    throw routeError(
      "DELIVERY_ADDRESS_TEXT_INVALID",
      "Địa chỉ giao hàng không hợp lệ",
      400
    );
  }

  return address;
}

function normalizeResultTypes(
  value
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(
          item =>
            String(
              item || ""
            ).trim()
        )
        .filter(Boolean)
    ),
  ];
}

function isDeliveryCapableType(
  types
) {
  return types.some(
    type =>
      DELIVERY_CAPABLE_TYPES.has(
        type
      )
  );
}

async function resolveDrivingRouteFromAddress({
  origin_latitude,
  origin_longitude,
  destination_address,
}) {
  const apiKey =
    String(
      process.env
        .GOOGLE_MAPS_ROUTES_API_KEY ||
      ""
    ).trim();

  if (!apiKey) {
    throw routeError(
      "DELIVERY_ROUTES_NOT_CONFIGURED",
      "Dịch vụ xác định tuyến giao hàng chưa được cấu hình"
    );
  }

  const originLat =
    normalizeCoordinate(
      origin_latitude,
      -90,
      90,
      "DELIVERY_ROUTE_ORIGIN_LATITUDE_INVALID"
    );

  const originLng =
    normalizeCoordinate(
      origin_longitude,
      -180,
      180,
      "DELIVERY_ROUTE_ORIGIN_LONGITUDE_INVALID"
    );

  const address =
    normalizeAddressText(
      destination_address
    );

  let response;

  try {
    response =
      await axios.post(
        GOOGLE_ROUTES_ENDPOINT,
        {
          origin: {
            location: {
              latLng: {
                latitude:
                  originLat,

                longitude:
                  originLng,
              },
            },
          },

          destination: {
            address,
          },

          travelMode:
            "DRIVE",

          routingPreference:
            "TRAFFIC_UNAWARE",
        },
        {
          headers: {
            "Content-Type":
              "application/json",

            "X-Goog-Api-Key":
              apiKey,

            "X-Goog-FieldMask":
              ROUTES_ADDRESS_FIELD_MASK,
          },

          timeout:
            10000,
        }
      );
  } catch (error) {
    throw routeError(
      "DELIVERY_ROUTES_PROVIDER_FAILED",
      error?.response?.data?.error?.message ||
        error.message
    );
  }

  const routes =
    Array.isArray(
      response.data?.routes
    )
      ? response.data.routes
      : [];

  if (routes.length === 0) {
    throw routeError(
      "DELIVERY_ADDRESS_NOT_FOUND",
      "Không xác định được địa chỉ giao hàng",
      400
    );
  }

  const route =
    routes[0];

  const endLocation =
    route?.legs?.[0]
      ?.endLocation
      ?.latLng;

  const latitude =
    Number(
      endLocation?.latitude
    );

  const longitude =
    Number(
      endLocation?.longitude
    );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw routeError(
      "DELIVERY_ADDRESS_ROUTE_ENDPOINT_INVALID"
    );
  }

  const geocoded =
    response.data
      ?.geocodingResults
      ?.destination ||
    {};

  const statusCode =
    Number(
      geocoded
        ?.geocoderStatus
        ?.code ||
      0
    );

  if (
    Number.isFinite(statusCode) &&
    statusCode !== 0
  ) {
    throw routeError(
      "DELIVERY_ADDRESS_NOT_FOUND",
      "Không xác định được địa chỉ giao hàng",
      400
    );
  }

  const placeId =
    String(
      geocoded?.placeId ||
      ""
    ).trim();

  if (!placeId) {
    throw routeError(
      "DELIVERY_ADDRESS_PLACE_ID_REQUIRED",
      "Địa chỉ chưa đủ rõ ràng, vui lòng nhập chi tiết hơn",
      400
    );
  }

  /*
   * Google Routes may mark a Vietnamese address as partialMatch even
   * when it produced a stable placeId, a usable delivery type and a
   * routable endpoint.
   *
   * Partial matching is therefore presentation metadata, not an
   * automatic rejection condition. Hard authority remains:
   * - provider success
   * - placeId
   * - usable delivery type
   * - valid route endpoint
   */
  const partialMatch =
    geocoded?.partialMatch === true;

  const types =
    normalizeResultTypes(
      geocoded?.type
    );

  if (
    !isDeliveryCapableType(
      types
    )
  ) {
    throw routeError(
      "DELIVERY_ADDRESS_TOO_COARSE",
      "Địa chỉ chưa đủ chính xác để giao hàng, vui lòng nhập thêm số nhà hoặc địa điểm cụ thể",
      400
    );
  }

  const distanceMeters =
    Number(
      route?.distanceMeters
    );

  if (
    !Number.isInteger(
      distanceMeters
    ) ||
    distanceMeters < 0
  ) {
    throw routeError(
      "DELIVERY_ROUTES_DISTANCE_INVALID"
    );
  }

  const durationSeconds =
    distanceMeters === 0
      ? 0
      : parseDurationSeconds(
          route?.duration
        );

  return {
    address_text:
      address,

    formatted_address:
      address,

    latitude,

    longitude,

    place_id:
      placeId,

    types,

    partial_match:
      partialMatch,

    distance_meters:
      distanceMeters,

    distance_km:
      distanceMeters / 1000,

    duration_seconds:
      durationSeconds,

    provider:
      "google_routes_v2",

    travel_mode:
      "DRIVE",
  };
}


async function resolveDrivingRouteFromPlaceId({
  origin_latitude,
  origin_longitude,
  destination_place_id,
}) {
  const apiKey =
    String(
      process.env
        .GOOGLE_MAPS_ROUTES_API_KEY ||
      ""
    ).trim();

  if (!apiKey) {
    throw routeError(
      "DELIVERY_ROUTES_NOT_CONFIGURED",
      "Dịch vụ xác định tuyến giao hàng chưa được cấu hình"
    );
  }

  const originLat =
    normalizeCoordinate(
      origin_latitude,
      -90,
      90,
      "DELIVERY_ROUTE_ORIGIN_LATITUDE_INVALID"
    );

  const originLng =
    normalizeCoordinate(
      origin_longitude,
      -180,
      180,
      "DELIVERY_ROUTE_ORIGIN_LONGITUDE_INVALID"
    );

  const placeId =
    String(
      destination_place_id ||
      ""
    ).trim();

  if (
    placeId.length < 5 ||
    placeId.length > 300
  ) {
    throw routeError(
      "DELIVERY_ADDRESS_PLACE_ID_INVALID",
      "Địa điểm giao hàng không hợp lệ",
      400
    );
  }

  let response;

  try {
    response =
      await axios.post(
        GOOGLE_ROUTES_ENDPOINT,
        {
          origin: {
            location: {
              latLng: {
                latitude:
                  originLat,

                longitude:
                  originLng,
              },
            },
          },

          destination: {
            placeId,
          },

          travelMode:
            "DRIVE",

          routingPreference:
            "TRAFFIC_UNAWARE",
        },
        {
          headers: {
            "Content-Type":
              "application/json",

            "X-Goog-Api-Key":
              apiKey,

            "X-Goog-FieldMask":
              ROUTES_PLACE_ID_FIELD_MASK,
          },

          timeout:
            10000,
        }
      );
  } catch (error) {
    throw routeError(
      "DELIVERY_ROUTES_PROVIDER_FAILED",
      error?.response?.data
        ?.error?.message ||
      error.message
    );
  }

  const routes =
    Array.isArray(
      response.data?.routes
    )
      ? response.data.routes
      : [];

  if (routes.length === 0) {
    throw routeError(
      "DELIVERY_ROUTES_NO_ROUTE",
      "Không tìm được tuyến đường bộ tới địa chỉ giao hàng",
      422
    );
  }

  const route =
    routes[0];

  const endLocation =
    route?.legs?.[0]
      ?.endLocation
      ?.latLng;

  const latitude =
    Number(
      endLocation?.latitude
    );

  const longitude =
    Number(
      endLocation?.longitude
    );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw routeError(
      "DELIVERY_ADDRESS_ROUTE_ENDPOINT_INVALID"
    );
  }

  const distanceMeters =
    Number(
      route?.distanceMeters
    );

  if (
    !Number.isInteger(
      distanceMeters
    ) ||
    distanceMeters < 0
  ) {
    throw routeError(
      "DELIVERY_ROUTES_DISTANCE_INVALID"
    );
  }

  const durationSeconds =
    distanceMeters === 0
      ? 0
      : parseDurationSeconds(
          route?.duration
        );

  return {
    place_id:
      placeId,

    latitude,

    longitude,

    distance_meters:
      distanceMeters,

    distance_km:
      distanceMeters / 1000,

    duration_seconds:
      durationSeconds,

    provider:
      "google_routes_v2",

    travel_mode:
      "DRIVE",
  };
}


async function resolveDrivingRoute({
  origin_latitude,
  origin_longitude,
  destination_latitude,
  destination_longitude,
}) {
  const apiKey =
    String(
      process.env
        .GOOGLE_MAPS_ROUTES_API_KEY ||
      ""
    ).trim();

  if (!apiKey) {
    throw routeError(
      "DELIVERY_ROUTES_NOT_CONFIGURED",
      "Dịch vụ tính quãng đường giao hàng chưa được cấu hình"
    );
  }

  const originLat =
    normalizeCoordinate(
      origin_latitude,
      -90,
      90,
      "DELIVERY_ROUTE_ORIGIN_LATITUDE_INVALID"
    );

  const originLng =
    normalizeCoordinate(
      origin_longitude,
      -180,
      180,
      "DELIVERY_ROUTE_ORIGIN_LONGITUDE_INVALID"
    );

  const destinationLat =
    normalizeCoordinate(
      destination_latitude,
      -90,
      90,
      "DELIVERY_ROUTE_DESTINATION_LATITUDE_INVALID"
    );

  const destinationLng =
    normalizeCoordinate(
      destination_longitude,
      -180,
      180,
      "DELIVERY_ROUTE_DESTINATION_LONGITUDE_INVALID"
    );

  let response;

  try {
    response =
      await axios.post(
        GOOGLE_ROUTES_ENDPOINT,
        {
          origin: {
            location: {
              latLng: {
                latitude:
                  originLat,

                longitude:
                  originLng,
              },
            },
          },

          destination: {
            location: {
              latLng: {
                latitude:
                  destinationLat,

                longitude:
                  destinationLng,
              },
            },
          },

          travelMode:
            "DRIVE",

          routingPreference:
            "TRAFFIC_UNAWARE",
        },
        {
          headers: {
            "Content-Type":
              "application/json",

            "X-Goog-Api-Key":
              apiKey,

            "X-Goog-FieldMask":
              ROUTES_FIELD_MASK,
          },

          timeout:
            10000,
        }
      );
  } catch (error) {
    throw routeError(
      "DELIVERY_ROUTES_PROVIDER_FAILED",
      error?.response?.data?.error?.message ||
        error.message
    );
  }

  const routes =
    Array.isArray(
      response.data?.routes
    )
      ? response.data.routes
      : [];

  if (routes.length === 0) {
    throw routeError(
      "DELIVERY_ROUTES_NO_ROUTE",
      "Không tìm được tuyến đường bộ tới địa chỉ giao hàng",
      422
    );
  }

  const route =
    routes[0];

  const distanceMeters =
    Number(
      route?.distanceMeters
    );

  if (
    !Number.isInteger(
      distanceMeters
    ) ||
    distanceMeters < 0
  ) {
    throw routeError(
      "DELIVERY_ROUTES_DISTANCE_INVALID"
    );
  }

  /*
   * Zero is valid only when origin and destination are effectively
   * identical. Do not invent a non-zero distance.
   */
  const durationSeconds =
    distanceMeters === 0
      ? 0
      : parseDurationSeconds(
          route?.duration
        );

  return {
    distance_meters:
      distanceMeters,

    distance_km:
      distanceMeters / 1000,

    duration_seconds:
      durationSeconds,

    provider:
      "google_routes_v2",

    travel_mode:
      "DRIVE",
  };
}

module.exports = {
  GOOGLE_ROUTES_ENDPOINT,
  ROUTES_FIELD_MASK,
  ROUTES_PLACE_ID_FIELD_MASK,
  ROUTES_ADDRESS_FIELD_MASK,
  DELIVERY_CAPABLE_TYPES,
  normalizeAddressText,
  parseDurationSeconds,
  resolveDrivingRoute,
  resolveDrivingRouteFromAddress,
  resolveDrivingRouteFromPlaceId,
};
