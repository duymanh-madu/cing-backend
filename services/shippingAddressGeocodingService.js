"use strict";

const axios =
  require("axios");


const GOOGLE_GEOCODE_BASE =
  "https://geocode.googleapis.com/v4/geocode/address";


const ACCEPTED_GRANULARITIES =
  new Set([
    "ROOFTOP",
    "RANGE_INTERPOLATED",
    "GEOMETRIC_CENTER",
  ]);


const DELIVERY_CAPABLE_TYPES =
  new Set([
    "street_address",
    "subpremise",
    "premise",
    "establishment",
    "point_of_interest",
    "intersection",
  ]);


function geocodingError(
  code,
  message = code
) {
  const error =
    new Error(message);

  error.code =
    code;

  return error;
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
    throw geocodingError(
      "DELIVERY_ADDRESS_TEXT_INVALID",
      "Địa chỉ giao hàng không hợp lệ"
    );
  }

  return address;
}


function normalizeResultTypes(
  value
) {
  if (
    !Array.isArray(value)
  ) {
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


function selectCanonicalGeocodeResult({
  results,
  normalized_address,
}) {
  const candidates =
    Array.isArray(results)
      ? results
      : [];

  if (
    candidates.length === 0
  ) {
    throw geocodingError(
      "DELIVERY_ADDRESS_NOT_FOUND",
      "Không xác định được địa chỉ giao hàng"
    );
  }

  /*
   * Forward geocoding may return multiple results when the
   * entered address is ambiguous.
   *
   * Delivery authority must never silently choose results[0].
   * The customer must refine the address instead.
   */
  if (
    candidates.length !== 1
  ) {
    throw geocodingError(
      "DELIVERY_ADDRESS_AMBIGUOUS",
      "Địa chỉ chưa đủ rõ ràng, vui lòng nhập chi tiết hơn"
    );
  }

  const result =
    candidates[0];

  const latitude =
    Number(
      result?.location?.latitude
    );

  const longitude =
    Number(
      result?.location?.longitude
    );

  if (
    !Number.isFinite(
      latitude
    ) ||
    !Number.isFinite(
      longitude
    ) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw geocodingError(
      "DELIVERY_GEOCODING_RESULT_INVALID"
    );
  }

  const granularity =
    String(
      result?.granularity ||
      ""
    ).trim();

  const types =
    normalizeResultTypes(
      result?.types
    );

  /*
   * Reject locality/region/route-level or approximate matches.
   *
   * A delivery candidate must describe a location that is
   * sufficiently specific to hand to shipping authority.
   */
  if (
    !ACCEPTED_GRANULARITIES.has(
      granularity
    ) ||
    !isDeliveryCapableType(
      types
    )
  ) {
    throw geocodingError(
      "DELIVERY_ADDRESS_TOO_COARSE",
      "Địa chỉ chưa đủ chính xác để giao hàng, vui lòng nhập thêm số nhà hoặc địa điểm cụ thể"
    );
  }

  return {
    latitude,

    longitude,

    formatted_address:
      String(
        result?.formattedAddress ||
        normalized_address ||
        ""
      ).trim(),

    place_id:
      String(
        result?.placeId ||
        ""
      ).trim() ||
      null,

    granularity,

    types,
  };
}


async function geocodeDeliveryAddress({
  address,
}) {
  const apiKey =
    String(
      process.env
        .GOOGLE_MAPS_GEOCODING_API_KEY ||
      ""
    ).trim();

  if (!apiKey) {
    throw geocodingError(
      "DELIVERY_GEOCODING_NOT_CONFIGURED",
      "Dịch vụ xác định địa chỉ giao hàng chưa được cấu hình"
    );
  }

  const normalizedAddress =
    normalizeAddressText(
      address
    );

  const encodedAddress =
    encodeURIComponent(
      normalizedAddress
    );

  let response;

  try {
    response =
      await axios.get(
        `${GOOGLE_GEOCODE_BASE}/${encodedAddress}`,
        {
          params: {
            languageCode:
              "vi",

            regionCode:
              "VN",
          },

          headers: {
            "X-Goog-Api-Key":
              apiKey,

            "X-Goog-FieldMask":
              [
                "results.placeId",
                "results.location",
                "results.formattedAddress",
                "results.granularity",
                "results.types",
              ].join(","),
          },

          timeout:
            8000,
        }
      );
  } catch (error) {
    throw geocodingError(
      "DELIVERY_GEOCODING_PROVIDER_FAILED",
      error?.response?.data?.error?.message ||
      error.message
    );
  }

  return selectCanonicalGeocodeResult({
    results:
      response.data?.results,

    normalized_address:
      normalizedAddress,
  });
}


module.exports = {
  ACCEPTED_GRANULARITIES,
  DELIVERY_CAPABLE_TYPES,
  geocodeDeliveryAddress,
  normalizeAddressText,
  selectCanonicalGeocodeResult,
};
