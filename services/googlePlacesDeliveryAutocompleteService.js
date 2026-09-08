"use strict";

const axios =
  require("axios");


const GOOGLE_PLACES_AUTOCOMPLETE_ENDPOINT =
  "https://places.googleapis.com/v1/places:autocomplete";


const GOOGLE_PLACES_DETAILS_BASE =
  "https://places.googleapis.com/v1/places";


const PLACES_DETAILS_FIELD_MASK =
  "id,name,formattedAddress";


const PLACES_AUTOCOMPLETE_FIELD_MASK =
  [
    "suggestions.placePrediction.placeId",
    "suggestions.placePrediction.text.text",
    "suggestions.placePrediction.structuredFormat.mainText.text",
    "suggestions.placePrediction.structuredFormat.secondaryText.text",
  ].join(",");


const SESSION_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


function placesError(
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


function normalizeAutocompleteInput(
  value
) {
  const input =
    String(
      value || ""
    )
      .trim()
      .replace(
        /\s+/g,
        " "
      );

  if (
    input.length < 2 ||
    input.length > 160
  ) {
    throw placesError(
      "DELIVERY_ADDRESS_AUTOCOMPLETE_INPUT_INVALID",
      "Nội dung tìm địa chỉ không hợp lệ",
      400
    );
  }

  return input;
}


function normalizeSessionToken(
  value
) {
  const token =
    String(
      value || ""
    ).trim();

  if (
    !SESSION_TOKEN_PATTERN.test(
      token
    )
  ) {
    throw placesError(
      "DELIVERY_ADDRESS_AUTOCOMPLETE_SESSION_INVALID",
      "Phiên tìm địa chỉ không hợp lệ",
      400
    );
  }

  return token.toLowerCase();
}


function normalizeOptionalCoordinate(
  value,
  min,
  max,
  code
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number < min ||
    number > max
  ) {
    throw placesError(
      code,
      code,
      400
    );
  }

  return number;
}


function normalizePlaceId(
  value
) {
  const placeId =
    String(
      value || ""
    ).trim();

  if (
    placeId.length < 5 ||
    placeId.length > 300
  ) {
    throw placesError(
      "DELIVERY_ADDRESS_PLACE_ID_INVALID",
      "Địa điểm giao hàng không hợp lệ",
      400
    );
  }

  return placeId;
}


async function getSelectedDeliveryPlaceDetails({
  place_id,
  session_token,
}) {
  const apiKey =
    String(
      process.env
        .GOOGLE_MAPS_PLACES_API_KEY ||
      ""
    ).trim();

  if (!apiKey) {
    throw placesError(
      "DELIVERY_PLACES_NOT_CONFIGURED",
      "Dịch vụ gợi ý địa chỉ chưa được cấu hình"
    );
  }

  const placeId =
    normalizePlaceId(
      place_id
    );

  const sessionToken =
    normalizeSessionToken(
      session_token
    );

  let response;

  try {
    response =
      await axios.get(
        `${GOOGLE_PLACES_DETAILS_BASE}/${encodeURIComponent(placeId)}`,
        {
          params: {
            sessionToken,
          },

          headers: {
            "X-Goog-Api-Key":
              apiKey,

            "X-Goog-FieldMask":
              PLACES_DETAILS_FIELD_MASK,
          },

          timeout:
            8000,
        }
      );
  } catch (error) {
    throw placesError(
      "DELIVERY_PLACE_DETAILS_PROVIDER_FAILED",
      error?.response?.data
        ?.error?.message ||
      error.message
    );
  }

  const returnedPlaceId =
    String(
      response.data?.id ||
      ""
    ).trim();

  const formattedAddress =
    String(
      response.data
        ?.formattedAddress ||
      ""
    )
      .trim()
      .replace(
        /\s+/g,
        " "
      );

  const resourceName =
    String(
      response.data?.name ||
      ""
    ).trim();

  /*
   * Google may canonicalize an Autocomplete Place ID alias when
   * Place Details resolves it.
   *
   * The requested alias therefore does NOT have to equal response.id.
   * Provider authority is instead:
   *
   * - the alias lookup itself succeeded with HTTP 200;
   * - response.id is a valid canonical Place ID;
   * - response.name is self-consistent with that canonical ID.
   *
   * Downstream Routes and the signed delivery candidate must use the
   * canonical response.id, never the original alias.
   */
  if (
    returnedPlaceId.length < 5 ||
    returnedPlaceId.length > 300
  ) {
    throw placesError(
      "DELIVERY_PLACE_DETAILS_ID_INVALID",
      "Maps không trả về mã địa điểm hợp lệ"
    );
  }

  if (
    resourceName !==
    `places/${returnedPlaceId}`
  ) {
    throw placesError(
      "DELIVERY_PLACE_DETAILS_RESOURCE_INVALID",
      "Dữ liệu địa điểm Maps không nhất quán"
    );
  }

  if (
    formattedAddress.length < 2 ||
    formattedAddress.length > 500
  ) {
    throw placesError(
      "DELIVERY_PLACE_DETAILS_ADDRESS_INVALID",
      "Không lấy được địa chỉ chuẩn từ Maps"
    );
  }

  return {
    requested_place_id:
      placeId,

    place_id:
      returnedPlaceId,

    resource_name:
      resourceName,

    canonicalized:
      returnedPlaceId !==
      placeId,

    formatted_address:
      formattedAddress,

    provider:
      "google_places_details_new",
  };
}


async function autocompleteDeliveryAddresses({
  input,
  session_token,
  current_latitude = null,
  current_longitude = null,
}) {
  const apiKey =
    String(
      process.env
        .GOOGLE_MAPS_PLACES_API_KEY ||
      ""
    ).trim();

  if (!apiKey) {
    throw placesError(
      "DELIVERY_PLACES_NOT_CONFIGURED",
      "Dịch vụ gợi ý địa chỉ chưa được cấu hình"
    );
  }

  const normalizedInput =
    normalizeAutocompleteInput(
      input
    );

  const sessionToken =
    normalizeSessionToken(
      session_token
    );

  const latitude =
    normalizeOptionalCoordinate(
      current_latitude,
      -90,
      90,
      "CURRENT_DELIVERY_LATITUDE_INVALID"
    );

  const longitude =
    normalizeOptionalCoordinate(
      current_longitude,
      -180,
      180,
      "CURRENT_DELIVERY_LONGITUDE_INVALID"
    );

  if (
    (latitude === null) !==
    (longitude === null)
  ) {
    throw placesError(
      "DELIVERY_ADDRESS_AUTOCOMPLETE_BIAS_INVALID",
      "Vị trí ưu tiên tìm kiếm không hợp lệ",
      400
    );
  }

  const body = {
    input:
      normalizedInput,

    sessionToken,

    languageCode:
      "vi",

    regionCode:
      "VN",

    includedRegionCodes:
      ["vn"],

    includeQueryPredictions:
      false,
  };

  if (
    latitude !== null &&
    longitude !== null
  ) {
    body.locationBias = {
      circle: {
        center: {
          latitude,
          longitude,
        },

        radius:
          50000,
      },
    };
  }

  let response;

  try {
    response =
      await axios.post(
        GOOGLE_PLACES_AUTOCOMPLETE_ENDPOINT,
        body,
        {
          headers: {
            "Content-Type":
              "application/json",

            "X-Goog-Api-Key":
              apiKey,

            "X-Goog-FieldMask":
              PLACES_AUTOCOMPLETE_FIELD_MASK,
          },

          timeout:
            8000,
        }
      );
  } catch (error) {
    throw placesError(
      "DELIVERY_PLACES_PROVIDER_FAILED",
      error?.response?.data
        ?.error?.message ||
      error.message
    );
  }

  const rawSuggestions =
    Array.isArray(
      response.data
        ?.suggestions
    )
      ? response.data
          .suggestions
      : [];

  const suggestions =
    rawSuggestions
      .map(
        item => {
          const prediction =
            item
              ?.placePrediction;

          const placeId =
            String(
              prediction
                ?.placeId ||
              ""
            ).trim();

          const description =
            String(
              prediction
                ?.text
                ?.text ||
              ""
            ).trim();

          const mainText =
            String(
              prediction
                ?.structuredFormat
                ?.mainText
                ?.text ||
              ""
            ).trim();

          const secondaryText =
            String(
              prediction
                ?.structuredFormat
                ?.secondaryText
                ?.text ||
              ""
            ).trim();

          if (
            !placeId ||
            !description
          ) {
            return null;
          }

          return {
            place_id:
              placeId,

            description,

            main_text:
              mainText ||
              description,

            secondary_text:
              secondaryText,
          };
        }
      )
      .filter(Boolean)
      .slice(
        0,
        5
      );

  return {
    success:
      true,

    provider:
      "google_places_autocomplete_new",

    session_token:
      sessionToken,

    suggestions,
  };
}


module.exports = {
  GOOGLE_PLACES_AUTOCOMPLETE_ENDPOINT,
  GOOGLE_PLACES_DETAILS_BASE,
  PLACES_AUTOCOMPLETE_FIELD_MASK,
  PLACES_DETAILS_FIELD_MASK,
  SESSION_TOKEN_PATTERN,
  autocompleteDeliveryAddresses,
  getSelectedDeliveryPlaceDetails,
  normalizeAutocompleteInput,
  normalizePlaceId,
  normalizeSessionToken,
};
