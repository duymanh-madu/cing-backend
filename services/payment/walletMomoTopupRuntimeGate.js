/*
 * =====================================================
 * CING WALLET — MOMO TOP-UP RUNTIME GATE V1
 * =====================================================
 *
 * This is a deployment entitlement, not a mutable
 * application/runtime feature flag.
 *
 * Fail-closed contract:
 * - unset  => disabled
 * - "true" => enabled
 * - every other value => disabled
 *
 * The same authority gates:
 * 1. creation of new Wallet MoMo top-up sessions
 * 2. reconciliation claim/query processing
 *
 * Existing durable provider proof may remain in PostgreSQL
 * while the entitlement is disabled. No reconciliation job
 * is claimed until this gate is enabled.
 */

const ENABLED_VALUE =
  "true";

function isWalletMomoTopupEnabled(
  env = process.env
) {
  return (
    String(
      env
        ?.CING_WALLET_MOMO_TOPUP_ENABLED ||
        ""
    )
      .trim()
      .toLowerCase() ===
    ENABLED_VALUE
  );
}

function assertWalletMomoTopupEnabled(
  env = process.env
) {
  if (
    isWalletMomoTopupEnabled(
      env
    )
  ) {
    return;
  }

  const error =
    new Error(
      "Nạp tiền Cing Wallet qua MoMo hiện chưa được mở"
    );

  error.code =
    "CING_WALLET_MOMO_TOPUP_DISABLED";

  error.statusCode =
    503;

  throw error;
}

module.exports = {
  isWalletMomoTopupEnabled,
  assertWalletMomoTopupEnabled,
};
