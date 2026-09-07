"use strict";

const supabase =
  require("../supabase");


const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


function consumeError(
  code,
  statusCode = 500,
  cause = null
) {
  const error =
    new Error(code);

  error.code =
    code;

  error.statusCode =
    statusCode;

  if (cause) {
    error.cause =
      cause;
  }

  return error;
}


function normalizeJti(
  value
) {
  const jti =
    String(
      value || ""
    ).trim();

  if (
    !UUID_PATTERN.test(
      jti
    )
  ) {
    throw consumeError(
      "DELIVERY_LOCATION_CANDIDATE_JTI_INVALID",
      400
    );
  }

  return jti;
}


function normalizeUserId(
  value
) {
  const userId =
    String(
      value || ""
    ).trim();

  if (!userId) {
    throw consumeError(
      "DELIVERY_LOCATION_CANDIDATE_USER_REQUIRED",
      401
    );
  }

  return userId;
}


function normalizeExpiresAt(
  exp
) {
  const seconds =
    Number(exp);

  if (
    !Number.isSafeInteger(
      seconds
    ) ||
    seconds <= 0
  ) {
    throw consumeError(
      "DELIVERY_LOCATION_CANDIDATE_EXPIRY_INVALID",
      400
    );
  }

  const date =
    new Date(
      seconds * 1000
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw consumeError(
      "DELIVERY_LOCATION_CANDIDATE_EXPIRY_INVALID",
      400
    );
  }

  return date.toISOString();
}


async function consumeDeliveryLocationCandidate({
  jti,
  user_id,
  exp,
}) {
  const candidateJti =
    normalizeJti(
      jti
    );

  const canonicalUserId =
    normalizeUserId(
      user_id
    );

  const expiresAt =
    normalizeExpiresAt(
      exp
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "cing_commerce_consume_delivery_location_candidate_v1",
      {
        p_candidate_jti:
          candidateJti,

        p_user_id:
          canonicalUserId,

        p_expires_at:
          expiresAt,
      }
    );

  if (error) {
    const message =
      String(
        error.message ||
        ""
      );

    if (
      message.includes(
        "DELIVERY_LOCATION_CANDIDATE_EXPIRED"
      )
    ) {
      throw consumeError(
        "DELIVERY_LOCATION_CANDIDATE_EXPIRED",
        400,
        error
      );
    }

    throw consumeError(
      "DELIVERY_LOCATION_CANDIDATE_CONSUME_FAILED",
      500,
      error
    );
  }

  if (
    !data ||
    String(
      data.candidate_jti ||
      ""
    ) !==
      candidateJti
  ) {
    throw consumeError(
      "DELIVERY_LOCATION_CANDIDATE_CONSUME_RESULT_INVALID",
      500
    );
  }

  if (
    data.replayed === true ||
    data.consumed !== true
  ) {
    throw consumeError(
      "DELIVERY_LOCATION_CANDIDATE_REPLAYED",
      409
    );
  }

  if (
    String(
      data.user_id ||
      ""
    ) !==
      canonicalUserId
  ) {
    throw consumeError(
      "DELIVERY_LOCATION_CANDIDATE_CONSUME_USER_MISMATCH",
      500
    );
  }

  return {
    candidate_jti:
      candidateJti,

    user_id:
      canonicalUserId,

    expires_at:
      data.expires_at,

    consumed_at:
      data.consumed_at,

    consumed:
      true,

    replayed:
      false,
  };
}


module.exports = {
  consumeDeliveryLocationCandidate,
};
