"use strict";

const SUPPORTED_LOCATION_SOURCES =
  new Set([
    "zalo_shell",
    "zalo_sdk",
    "browser_geolocation",
    "typed_address_geocode",
    "unknown",
  ]);

function isDeliveryOrderType(
  value
) {
  const type =
    String(value || "")
      .trim()
      .toLowerCase();

  return [
    "delivery",
    "deli",
    "ship",
    "shipping",
  ].includes(type);
}

function normalizeOptionalText(
  value,
  maxLength
) {
  const text =
    String(value || "").trim();

  if (!text) {
    return null;
  }

  return text.slice(
    0,
    maxLength
  );
}

function normalizeDeliveryLocation({
  order_type,
  latitude,
  longitude,
  address_detail,
  location_source,
}) {
  if (
    !isDeliveryOrderType(
      order_type
    )
  ) {
    return {
      delivery_latitude: null,
      delivery_longitude: null,
      delivery_address_detail: null,
      delivery_location_source: null,
    };
  }

  const hasLatitude =
    latitude !== null &&
    latitude !== undefined &&
    String(latitude).trim() !== "";

  const hasLongitude =
    longitude !== null &&
    longitude !== undefined &&
    String(longitude).trim() !== "";

  const lat =
    Number(latitude);

  const lng =
    Number(longitude);

  if (
    !hasLatitude ||
    !hasLongitude ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    const error =
      new Error(
        "DELIVERY_LOCATION_REQUIRED"
      );

    error.code =
      "DELIVERY_LOCATION_REQUIRED";

    throw error;
  }

  const rawSource =
    String(
      location_source ||
      "unknown"
    )
      .trim()
      .toLowerCase();

  const source =
    SUPPORTED_LOCATION_SOURCES
      .has(rawSource)
      ? rawSource
      : "unknown";

  return {
    delivery_latitude: lat,
    delivery_longitude: lng,
    delivery_address_detail:
      normalizeOptionalText(
        address_detail,
        500
      ),
    delivery_location_source:
      source,
  };
}

module.exports = {
  isDeliveryOrderType,
  normalizeDeliveryLocation,
};
