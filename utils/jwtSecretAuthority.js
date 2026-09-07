"use strict";

/**
 * =====================================================
 * JWT SECRET AUTHORITY
 * =====================================================
 *
 * One runtime authority for access/admin/shipper JWT signing
 * and verification.
 *
 * Security contract:
 *
 * - JWT_SECRET must be explicitly configured.
 * - there is no default, development or emergency fallback.
 * - missing configuration fails closed while loading the
 *   authentication surface rather than silently accepting a
 *   predictable signing key.
 */

function requireJwtSecret() {
  const secret =
    String(
      process.env.JWT_SECRET ||
      ""
    ).trim();

  if (!secret) {
    const error =
      new Error(
        "JWT_SECRET is required"
      );

    error.code =
      "JWT_SECRET_REQUIRED";

    throw error;
  }

  return secret;
}

const JWT_SECRET =
  requireJwtSecret();

module.exports = {
  JWT_SECRET,
  requireJwtSecret,
};
