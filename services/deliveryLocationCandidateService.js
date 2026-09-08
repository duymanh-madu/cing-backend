"use strict";

const crypto =
  require("crypto");


const TOKEN_VERSION =
  "cing_delivery_location_candidate_v2";

const TOKEN_TTL_SECONDS =
  15 * 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


function candidateError(
  code,
  message = code,
  statusCode = 400
) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;
}


function getSecret() {
  const secret =
    String(
      process.env
        .SHIPPING_LOCATION_TOKEN_SECRET ||
      ""
    ).trim();

  if (
    secret.length < 32
  ) {
    throw candidateError(
      "DELIVERY_LOCATION_TOKEN_SECRET_NOT_CONFIGURED",
      "DELIVERY_LOCATION_TOKEN_SECRET_NOT_CONFIGURED",
      503
    );
  }

  return secret;
}


function normalizeCandidateUserId(
  value
) {
  const userId =
    String(
      value || ""
    ).trim();

  if (!userId) {
    throw candidateError(
      "DELIVERY_LOCATION_CANDIDATE_USER_REQUIRED",
      "DELIVERY_LOCATION_CANDIDATE_USER_REQUIRED",
      401
    );
  }

  return userId;
}


function base64url(
  value
) {
  return Buffer
    .from(value)
    .toString("base64url");
}


function signPayload(
  encodedPayload,
  secret
) {
  return crypto
    .createHmac(
      "sha256",
      secret
    )
    .update(
      encodedPayload
    )
    .digest(
      "base64url"
    );
}


function createDeliveryLocationCandidate({
  user_id,
  latitude,
  longitude,
  formatted_address,
  address_text,
  place_id = null,
  shipping_distance_km,
  shipping_fee,
  route_distance_meters = null,
  route_duration_seconds = null,
  route_provider = null,
}) {
  const userId =
    normalizeCandidateUserId(
      user_id
    );

  const now =
    Math.floor(
      Date.now() / 1000
    );

  const payload = {
    v:
      TOKEN_VERSION,

    jti:
      crypto.randomUUID(),

    user_id:
      userId,

    iat:
      now,

    exp:
      now +
      TOKEN_TTL_SECONDS,

    latitude:
      Number(latitude),

    longitude:
      Number(longitude),

    formatted_address:
      String(
        formatted_address || ""
      ).trim(),

    address_text:
      String(
        address_text || ""
      ).trim(),

    place_id:
      place_id
        ? String(place_id)
        : null,

    shipping_distance_km:
      Number(
        shipping_distance_km
      ),

    shipping_fee:
      Number(
        shipping_fee
      ),

    route_distance_meters:
      route_distance_meters === null
        ? null
        : Number(
            route_distance_meters
          ),

    route_duration_seconds:
      route_duration_seconds === null
        ? null
        : Number(
            route_duration_seconds
          ),

    route_provider:
      route_provider
        ? String(
            route_provider
          ).trim()
        : null,
  };

  if (
    payload.route_distance_meters !== null &&
    (
      !Number.isInteger(
        payload.route_distance_meters
      ) ||
      payload.route_distance_meters < 0
    )
  ) {
    throw candidateError(
      "DELIVERY_LOCATION_CANDIDATE_ROUTE_DISTANCE_INVALID"
    );
  }

  if (
    payload.route_duration_seconds !== null &&
    (
      !Number.isInteger(
        payload.route_duration_seconds
      ) ||
      payload.route_duration_seconds < 0
    )
  ) {
    throw candidateError(
      "DELIVERY_LOCATION_CANDIDATE_ROUTE_DURATION_INVALID"
    );
  }

  if (
    !Number.isFinite(
      payload.latitude
    ) ||
    !Number.isFinite(
      payload.longitude
    ) ||
    payload.latitude < -90 ||
    payload.latitude > 90 ||
    payload.longitude < -180 ||
    payload.longitude > 180
  ) {
    throw candidateError(
      "DELIVERY_LOCATION_CANDIDATE_INVALID"
    );
  }

  const encoded =
    base64url(
      JSON.stringify(
        payload
      )
    );

  const signature =
    signPayload(
      encoded,
      getSecret()
    );

  return `${encoded}.${signature}`;
}


function verifyDeliveryLocationCandidate(
  token,
  {
    expected_user_id,
  } = {}
) {
  const expectedUserId =
    normalizeCandidateUserId(
      expected_user_id
    );

  const value =
    String(
      token || ""
    ).trim();

  const parts =
    value.split(".");

  if (
    parts.length !== 2
  ) {
    throw candidateError(
      "DELIVERY_LOCATION_CANDIDATE_TOKEN_INVALID"
    );
  }

  const [
    encoded,
    signature,
  ] = parts;

  if (
    !encoded ||
    !signature
  ) {
    throw candidateError(
      "DELIVERY_LOCATION_CANDIDATE_TOKEN_INVALID"
    );
  }

  const expected =
    signPayload(
      encoded,
      getSecret()
    );

  const actualBuffer =
    Buffer.from(signature);

  const expectedBuffer =
    Buffer.from(expected);

  if (
    actualBuffer.length !==
      expectedBuffer.length ||
    !crypto.timingSafeEqual(
      actualBuffer,
      expectedBuffer
    )
  ) {
    throw candidateError(
      "DELIVERY_LOCATION_CANDIDATE_TOKEN_INVALID"
    );
  }

  let payload;

  try {
    payload =
      JSON.parse(
        Buffer
          .from(
            encoded,
            "base64url"
          )
          .toString(
            "utf8"
          )
      );
  } catch {
    throw candidateError(
      "DELIVERY_LOCATION_CANDIDATE_TOKEN_INVALID"
    );
  }

  const now =
    Math.floor(
      Date.now() / 1000
    );

  if (
    payload?.v !==
      TOKEN_VERSION ||
    !UUID_PATTERN.test(
      String(
        payload?.jti ||
        ""
      )
    ) ||
    !Number.isInteger(
      payload?.iat
    ) ||
    !Number.isInteger(
      payload?.exp
    ) ||
    payload.exp < now ||
    payload.exp <=
      payload.iat
  ) {
    throw candidateError(
      "DELIVERY_LOCATION_CANDIDATE_TOKEN_EXPIRED"
    );
  }

  const tokenUserId =
    normalizeCandidateUserId(
      payload.user_id
    );

  if (
    tokenUserId !==
      expectedUserId
  ) {
    throw candidateError(
      "DELIVERY_LOCATION_CANDIDATE_USER_MISMATCH",
      "DELIVERY_LOCATION_CANDIDATE_USER_MISMATCH",
      403
    );
  }

  const latitude =
    Number(
      payload.latitude
    );

  const longitude =
    Number(
      payload.longitude
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
    throw candidateError(
      "DELIVERY_LOCATION_CANDIDATE_TOKEN_INVALID"
    );
  }

  return {
    ...payload,

    user_id:
      tokenUserId,

    latitude,

    longitude,
  };
}


module.exports = {
  TOKEN_VERSION,
  TOKEN_TTL_SECONDS,
  createDeliveryLocationCandidate,
  verifyDeliveryLocationCandidate,
};
