/*
 * =====================================================
 * CING WALLET — TOP-UP PROVIDER RUNTIME GATE V2
 * =====================================================
 *
 * Separate deployment entitlements are intentional.
 *
 * Legacy MoMo top-ups may still require reconciliation
 * after new top-up creation has moved to Zalo Checkout.
 * Therefore disabling one provider must never disable
 * recovery for the other provider.
 */

const {
  isWalletMomoTopupEnabled,
  assertWalletMomoTopupEnabled,
} = require(
  "./walletMomoTopupRuntimeGate"
);

const ENABLED_VALUE =
  "true";

function isWalletZaloCheckoutTopupEnabled(
  env = process.env
) {
  return (
    String(
      env
        ?.CING_WALLET_ZALO_CHECKOUT_TOPUP_ENABLED ||
        ""
    )
      .trim()
      .toLowerCase() ===
    ENABLED_VALUE
  );
}

function assertWalletZaloCheckoutTopupEnabled(
  env = process.env
) {
  if (
    isWalletZaloCheckoutTopupEnabled(
      env
    )
  ) {
    return;
  }

  const error =
    new Error(
      "Nạp tiền Cing Wallet qua Zalo Checkout hiện chưa được mở"
    );

  error.code =
    "CING_WALLET_ZALO_CHECKOUT_TOPUP_DISABLED";

  error.statusCode =
    503;

  throw error;
}

function normalizeWalletTopupProvider(
  provider
) {
  return String(
    provider || ""
  )
    .trim()
    .toLowerCase();
}

function isWalletTopupProviderEnabled(
  provider,
  env = process.env
) {
  const normalized =
    normalizeWalletTopupProvider(
      provider
    );

  if (normalized === "momo") {
    return isWalletMomoTopupEnabled(
      env
    );
  }

  if (
    normalized ===
    "zalo_checkout"
  ) {
    return isWalletZaloCheckoutTopupEnabled(
      env
    );
  }

  return false;
}

function assertWalletTopupProviderEnabled(
  provider,
  env = process.env
) {
  const normalized =
    normalizeWalletTopupProvider(
      provider
    );

  if (normalized === "momo") {
    return assertWalletMomoTopupEnabled(
      env
    );
  }

  if (
    normalized ===
    "zalo_checkout"
  ) {
    return assertWalletZaloCheckoutTopupEnabled(
      env
    );
  }

  const error =
    new Error(
      "Nhà cung cấp nạp Cing Wallet không được hỗ trợ"
    );

  error.code =
    "CING_WALLET_TOPUP_PROVIDER_UNSUPPORTED";

  error.statusCode =
    409;

  throw error;
}

function getWalletTopupProviderEntitlements(
  env = process.env
) {
  return {
    momo:
      isWalletMomoTopupEnabled(
        env
      ),

    zalo_checkout:
      isWalletZaloCheckoutTopupEnabled(
        env
      ),
  };
}

module.exports = {
  isWalletZaloCheckoutTopupEnabled,
  assertWalletZaloCheckoutTopupEnabled,
  isWalletTopupProviderEnabled,
  assertWalletTopupProviderEnabled,
  getWalletTopupProviderEntitlements,
  normalizeWalletTopupProvider,
};
