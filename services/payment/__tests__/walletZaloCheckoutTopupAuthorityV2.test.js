const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const topupService =
  fs.readFileSync(
    "services/wallet/cingWalletTopupSessionService.js",
    "utf8"
  );

const webhookRoute =
  fs.readFileSync(
    "routes/paymentWebhookRoutes.js",
    "utf8"
  );

function getZaloCallbackSection() {
  const start =
    webhookRoute.indexOf(
      "async function processZaloCheckoutAsPaid"
    );

  const end =
    webhookRoute.indexOf(
      'router.post("/zalo/callback"',
      start
    );

  assert.ok(
    start >= 0 &&
    end > start,
    "Zalo callback boundary missing"
  );

  return webhookRoute.slice(
    start,
    end
  );
}

test(
  "Wallet top-up creation is backend-hard-bound to Zalo Checkout",
  () => {
    assert.match(
      topupService,
      /payment_provider:\s*"zalo_checkout"/
    );

    assert.match(
      topupService,
      /payment_method:\s*"zalo_checkout"/
    );

    assert.match(
      topupService,
      /payment_purpose:\s*"wallet_topup"/
    );

    assert.doesNotMatch(
      topupService,
      /payment_provider:\s*customer/
    );

    assert.doesNotMatch(
      topupService,
      /payment_method:\s*customer/
    );
  }
);

test(
  "Zalo Checkout callback fails closed when MAC is absent or invalid",
  () => {
    const zalo =
      getZaloCallbackSection();

    assert.match(
      zalo,
      /typeof body\.mac !== "string"/
    );

    assert.match(
      zalo,
      /ZALO_CHECKOUT_CALLBACK_MAC_REQUIRED/
    );

    assert.match(
      zalo,
      /verifyZaloCheckoutMac\([\s\S]*data[\s\S]*body\.mac\.trim\(\)/
    );

    assert.match(
      zalo,
      /INVALID_ZALO_CHECKOUT_CALLBACK_MAC/
    );
  }
);

test(
  "Zalo callback rebinds provider and amount to canonical payment",
  () => {
    const zalo =
      getZaloCallbackSection();

    assert.match(
      zalo,
      /payment_provider[\s\S]*zalo_checkout/
    );

    assert.match(
      zalo,
      /PAYMENT_PROVIDER_MISMATCH/
    );

    assert.match(
      zalo,
      /Number\(\s*payment\.amount\s*\)[\s\S]*!== amount/
    );

    assert.match(
      zalo,
      /PAYMENT_AMOUNT_MISMATCH/
    );
  }
);

test(
  "Wallet Zalo success persists provider proof before atomic Wallet settlement",
  () => {
    const zalo =
      getZaloCallbackSection();

    const walletStart =
      zalo.indexOf(
        'payment.payment_purpose ===\n      "wallet_topup"'
      );

    const proof =
      zalo.indexOf(
        "settlement_verified_at:",
        walletStart
      );

    const rpc =
      zalo.indexOf(
        '"cing_wallet_settle_verified_topup_atomic"',
        proof
      );

    assert.ok(
      walletStart >= 0,
      "Wallet top-up branch missing"
    );

    assert.ok(
      proof > walletStart,
      "durable settlement proof must be persisted inside Wallet branch"
    );

    assert.ok(
      rpc > proof,
      "Wallet RPC must run only after durable provider proof"
    );

    assert.match(
      zalo.slice(
        walletStart,
        rpc + 500
      ),
      /p_payment_transaction_id:\s*payment\.id/
    );

    assert.doesNotMatch(
      zalo.slice(
        walletStart,
        rpc + 500
      ),
      /p_user_id|p_amount/
    );
  }
);

test(
  "Wallet Zalo branch cannot enter commerce order settlement",
  () => {
    const zalo =
      getZaloCallbackSection();

    const walletStart =
      zalo.indexOf(
        'payment.payment_purpose ===\n      "wallet_topup"'
      );

    const purposeGuard =
      zalo.indexOf(
        'payment.payment_purpose !==\n      "order"',
        walletStart
      );

    assert.ok(
      walletStart >= 0 &&
      purposeGuard > walletStart
    );

    const walletSection =
      zalo.slice(
        walletStart,
        purposeGuard
      );

    assert.doesNotMatch(
      walletSection,
      /processNormalizedPaymentResult\(/
    );

    assert.doesNotMatch(
      walletSection,
      /processPaidOrderSettlement\(/
    );

    assert.doesNotMatch(
      walletSection,
      /pushOrderToIPOS\(/
    );

    assert.doesNotMatch(
      walletSection,
      /awardGamePlaysForPaidOrder\(/
    );
  }
);

test(
  "stale Zalo failure cannot downgrade durable Wallet success",
  () => {
    const zalo =
      getZaloCallbackSection();

    assert.match(
      zalo,
      /payment\.payment_status ===[\s\S]*"paid"[\s\S]*payment\.settlement_verified_at[\s\S]*payment\.settlement_consumed_at/
    );

    assert.match(
      zalo,
      /PAYMENT_SUCCESS_ALREADY_DURABLE/
    );
  }
);

test(
  "commerce Zalo payments retain the shared paid order pipeline",
  () => {
    const zalo =
      getZaloCallbackSection();

    const purposeGuard =
      zalo.indexOf(
        'payment.payment_purpose !==\n      "order"'
      );

    const commerce =
      zalo.indexOf(
        "await processNormalizedPaymentResult({",
        purposeGuard
      );

    assert.ok(
      purposeGuard >= 0 &&
      commerce > purposeGuard,
      "order settlement pipeline missing after Wallet purpose guard"
    );
  }
);
