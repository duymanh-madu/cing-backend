const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const crypto =
  require("crypto");

const logger =
  require("../../loggerService");

const {
  FINGERPRINT_HEX_LENGTH,
  fingerprintInstallationId,
  logAuthInstallationObservation,
} = require(
  "../authInstallationObservability"
);

test(
  "fingerprint matches canonical sha256 prefix",
  () => {
    const raw =
      "installation-test-value-123";

    const expected =
      crypto
        .createHash("sha256")
        .update(raw, "utf8")
        .digest("hex")
        .slice(
          0,
          FINGERPRINT_HEX_LENGTH
        );

    assert.equal(
      fingerprintInstallationId(raw),
      expected
    );

    assert.equal(
      expected.length,
      16
    );
  }
);

test(
  "empty installation id returns null fingerprint",
  () => {
    assert.equal(
      fingerprintInstallationId(""),
      null
    );

    assert.equal(
      fingerprintInstallationId("   "),
      null
    );

    assert.equal(
      fingerprintInstallationId(null),
      null
    );
  }
);

test(
  "structured observation never logs raw installation id",
  () => {
    const raw =
      "raw-installation-secret-value";

    const captured = [];

    const originalInfo =
      logger.info;

    logger.info =
      (message, metadata) => {
        captured.push({
          message,
          metadata,
        });
      };

    try {
      logAuthInstallationObservation({
        surface:
          "session_open",

        installationId:
          raw,

        requestId:
          "request-test-123",
      });
    } finally {
      logger.info =
        originalInfo;
    }

    assert.equal(
      captured.length,
      1
    );

    const serialized =
      JSON.stringify(
        captured[0]
      );

    assert.equal(
      serialized.includes(raw),
      false,
      "raw installation id must never appear in observation log"
    );

    assert.equal(
      captured[0].metadata.installation_present,
      true
    );

    assert.equal(
      captured[0].metadata.installation_fp,
      fingerprintInstallationId(raw)
    );

    assert.equal(
      captured[0].metadata.installation_fp.length,
      16
    );

    assert.equal(
      captured[0].metadata.request_id,
      "request-test-123"
    );
  }
);

test(
  "observation with missing installation id logs presence=false without identifier",
  () => {
    const captured = [];

    const originalInfo =
      logger.info;

    logger.info =
      (message, metadata) => {
        captured.push({
          message,
          metadata,
        });
      };

    try {
      logAuthInstallationObservation({
        surface:
          "member_app_open",

        installationId:
          "",

        requestId:
          null,
      });
    } finally {
      logger.info =
        originalInfo;
    }

    assert.equal(
      captured.length,
      1
    );

    assert.equal(
      captured[0].metadata.installation_present,
      false
    );

    assert.equal(
      captured[0].metadata.installation_fp,
      null
    );

    assert.equal(
      captured[0].metadata.request_id,
      null
    );
  }
);
