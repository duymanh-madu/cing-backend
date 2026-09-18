const crypto =
  require("crypto");

const logger =
  require("../loggerService");

const FINGERPRINT_HEX_LENGTH = 16;

function normalizeInstallationId(
  value
) {
  return String(
    value || ""
  ).trim();
}

function fingerprintInstallationId(
  value
) {
  const normalized =
    normalizeInstallationId(
      value
    );

  if (!normalized) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(
      normalized,
      "utf8"
    )
    .digest("hex")
    .slice(
      0,
      FINGERPRINT_HEX_LENGTH
    );
}

function logAuthInstallationObservation({
  surface,
  installationId,
  requestId = null,
}) {
  const normalizedSurface =
    String(
      surface || ""
    ).trim();

  if (!normalizedSurface) {
    throw new Error(
      "auth_installation_observation_surface_required"
    );
  }

  const normalizedInstallationId =
    normalizeInstallationId(
      installationId
    );

  logger.info(
    "Auth installation observation",
    {
      surface:
        normalizedSurface,

      installation_present:
        normalizedInstallationId.length > 0,

      installation_fp:
        fingerprintInstallationId(
          normalizedInstallationId
        ),

      request_id:
        requestId
          ? String(requestId)
          : null,
    }
  );
}

module.exports = {
  FINGERPRINT_HEX_LENGTH,
  normalizeInstallationId,
  fingerprintInstallationId,
  logAuthInstallationObservation,
};
