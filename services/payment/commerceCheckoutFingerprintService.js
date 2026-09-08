"use strict";

const crypto =
  require("crypto");


function canonicalize(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    Array.isArray(value)
  ) {
    return value.map(
      canonicalize
    );
  }

  if (
    typeof value ===
      "object"
  ) {
    return Object
      .keys(value)
      .sort()
      .reduce(
        (
          result,
          key
        ) => {
          result[key] =
            canonicalize(
              value[key]
            );

          return result;
        },
        {}
      );
  }

  if (
    typeof value ===
      "number"
  ) {
    if (
      !Number.isFinite(value)
    ) {
      throw new Error(
        "COMMERCE_CHECKOUT_FINGERPRINT_NUMBER_INVALID"
      );
    }

    return value;
  }

  return value;
}


function createCommerceCheckoutFingerprint(
  payload
) {
  const canonical =
    canonicalize(
      payload || {}
    );

  return crypto
    .createHash(
      "sha256"
    )
    .update(
      JSON.stringify(
        canonical
      )
    )
    .digest(
      "hex"
    );
}


module.exports = {
  canonicalize,
  createCommerceCheckoutFingerprint,
};
