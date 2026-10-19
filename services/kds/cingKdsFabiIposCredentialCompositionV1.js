"use strict";

/*
 * Cing KDS FABi iPOS Credential Composition V1
 *
 * Dormant, dependency-injected composition only.
 *
 * This module intentionally owns NO:
 *
 * - environment-variable or dotenv ownership
 * - secret values or logging
 * - HTTP execution at construction
 * - database, timer, server, route, or scheduler
 *
 * Railway (or another approved secret boundary) supplies a
 * configuration provider at runtime. FABi's documented transport
 * contract still needs two header fields even when Foodhub issues
 * the same brand token for both:
 *
 *   IPOS_TOKEN        -> Authorization
 *   IPOS_ACCESS_TOKEN -> access_token
 *
 * Values are deliberately not normalized, prefixed, logged, or
 * compared. The provider returns the exact approved header values.
 */

const {
  createFabiC04HttpClientV1
} = require(
  "./cingKdsFabiC04HttpClientV1"
);

const {
  createFabiC03HttpClientV1
} = require(
  "./cingKdsFabiC03HttpClientV1"
);

function compositionError(
  code
) {
  const error =
    new Error(code);

  error.code =
    code;

  return error;
}

function requiredFunction(
  value,
  code
) {
  if (typeof value !== "function") {
    throw compositionError(code);
  }

  return value;
}

function requiredString(
  value,
  code
) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw compositionError(code);
  }

  return value.trim();
}

function createFabiIposCredentialCompositionV1({
  configurationProvider,
  requestFn,
  requestTimeoutMs = 10_000,
  timezoneOffsetMs = 25_200_000
} = {}) {
  const loadConfiguration =
    requiredFunction(
      configurationProvider,
      "KDS_FABI_IPOS_CONFIGURATION_PROVIDER_REQUIRED"
    );

  requiredFunction(
    requestFn,
    "KDS_FABI_IPOS_REQUEST_FN_REQUIRED"
  );

  async function credential(
    name,
    missingCode
  ) {
    const configuration =
      await loadConfiguration();

    if (
      !configuration ||
      typeof configuration !== "object" ||
      Array.isArray(configuration)
    ) {
      throw compositionError(
        "KDS_FABI_IPOS_CONFIGURATION_INVALID"
      );
    }

    return requiredString(
      configuration[name],
      missingCode
    );
  }

  async function authProvider() {
    return credential(
      "IPOS_TOKEN",
      "KDS_FABI_IPOS_AUTH_REQUIRED"
    );
  }

  async function appAccessTokenProvider() {
    return credential(
      "IPOS_ACCESS_TOKEN",
      "KDS_FABI_IPOS_APP_ACCESS_REQUIRED"
    );
  }

  const c04HttpClient =
    createFabiC04HttpClientV1({
      authProvider,
      appAccessTokenProvider,
      requestFn,
      requestTimeoutMs
    });

  const c03HttpClient =
    createFabiC03HttpClientV1({
      authProvider,
      appAccessTokenProvider,
      requestFn,
      requestTimeoutMs,
      timezoneOffsetMs
    });

  return Object.freeze({
    authProvider,
    appAccessTokenProvider,
    c04HttpClient,
    c03HttpClient
  });
}

module.exports = {
  createFabiIposCredentialCompositionV1
};
