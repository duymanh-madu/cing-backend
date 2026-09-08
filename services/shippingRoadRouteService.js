"use strict";

const axios =
  require("axios");

const GOOGLE_ROUTES_ENDPOINT =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

const ROUTES_FIELD_MASK =
  "routes.distanceMeters,routes.duration";

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
  parseDurationSeconds,
  resolveDrivingRoute,
};
