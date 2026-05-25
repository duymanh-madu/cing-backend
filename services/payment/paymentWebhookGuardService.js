/**
 * =====================================================
 * DEPRECATED
 * =====================================================
 *
 * Replaced by:
 *
 * - paymentWebhookSecurityService
 * - paymentReplayProtectionService
 * - paymentLockService
 *
 * DO NOT USE FOR NEW LOGIC
 *
 */

const crypto =
  require("crypto");

function verifyWebhookSignature({

  raw_body,

  signature,

  secret,

}) {

  const hash =

    crypto

      .createHmac(
        "sha256",
        secret
      )

      .update(raw_body)

      .digest("hex");

  return hash === signature;

}

module.exports = {

  verifyWebhookSignature,

};