const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const route =
  fs.readFileSync(
    "routes/paymentWebhookRoutes.js",
    "utf8"
  );

test(
  "MoMo route verifies callback before any paid processing",
  () => {
    assert.match(
      route,
      /verifyMomoSettlement\(\s*req\.body\s*\)/
    );

    const verifyPos =
      route.indexOf(
        "verifyMomoSettlement("
      );

    const normalizedPos =
      route.indexOf(
        "await processNormalizedPaymentResult",
        verifyPos
      );

    assert.ok(
      verifyPos >= 0 &&
      normalizedPos > verifyPos
    );
  }
);

test(
  "invalid MoMo settlement fails closed",
  () => {
    assert.match(
      route,
      /INVALID_MOMO_SETTLEMENT/
    );

    assert.match(
      route,
      /res\.status\(400\)/
    );
  }
);

test(
  "MoMo settlement binds to stored provider and amount",
  () => {
    assert.match(
      route,
      /payment\.payment_provider !==\s*"momo"/
    );

    assert.match(
      route,
      /PAYMENT_PROVIDER_MISMATCH/
    );

    assert.match(
      route,
      /storedAmount !==\s*verified\.amount/
    );

    assert.match(
      route,
      /PAYMENT_AMOUNT_MISMATCH/
    );
  }
);

test(
  "MoMo settlement fences rebinding only after durable verification",
  () => {
    assert.match(
      route,
      /payment\.settlement_verified_at[\s\S]*payment\.settlement_reference[\s\S]*verified\.providerTransactionId[\s\S]*PROVIDER_TRANSACTION_MISMATCH/
    );

    assert.doesNotMatch(
      route,
      /payment\.provider_transaction_id\s*&&[\s\S]*PROVIDER_TRANSACTION_MISMATCH/
    );
  }
);

test(
  "successful verified MoMo callback writes durable settlement proof",
  () => {
    assert.match(
      route,
      /settlement_verified_at:\s*now/
    );

    assert.match(
      route,
      /settlement_verification_method:\s*verified\.verificationMethod/
    );

    assert.match(
      route,
      /settlement_reference:[\s\S]*verified\.settlementReference/
    );
  }
);

test(
  "failed signed MoMo result does not write settlement success proof",
  () => {
    const momoStart =
      route.indexOf(
        "const momoIpnHandler"
      );

    const failedStart =
      route.indexOf(
        "if (!verified.succeeded)",
        momoStart
      );

    const successStart =
      route.indexOf(
        "error: verifiedUpdateError",
        failedStart
      );

    assert.ok(
      momoStart >= 0 &&
      failedStart > momoStart &&
      successStart > failedStart
    );

    const failedSection =
      route.slice(
        failedStart,
        successStart
      );

    assert.match(
      failedSection,
      /payment_status:[\s\S]*"failed"/
    );

    assert.match(
      failedSection,
      /\.status\(204\)[\s\S]*\.send\(\)/
    );

    assert.doesNotMatch(
      failedSection,
      /settlement_verified_at/
    );

    assert.doesNotMatch(
      failedSection,
      /settlement_verification_method/
    );

    assert.doesNotMatch(
      failedSection,
      /settlement_reference:/
    );
  }
);

test(
  "verified wallet top-up settles through bounded Wallet authority and never commerce",
  () => {
    const momoStart =
      route.indexOf(
        "const momoIpnHandler"
      );

    const zaloStart =
      route.indexOf(
        "async function processZaloCheckoutAsPaid"
      );

    assert.ok(
      momoStart >= 0 &&
      zaloStart > momoStart
    );

    const momoSection =
      route.slice(
        momoStart,
        zaloStart
      );

    const proofPos =
      momoSection.indexOf(
        "settlement_verified_at:"
      );

    const walletBranchPos =
      momoSection.indexOf(
        'payment.payment_purpose ===\n    "wallet_topup"',
        proofPos
      );

    const walletRpcPos =
      momoSection.indexOf(
        '"cing_wallet_settle_verified_topup_atomic"',
        walletBranchPos
      );

    const walletAckPos =
      momoSection.indexOf(
        ".status(204)",
        walletRpcPos
      );

    const commerceGuardPos =
      momoSection.indexOf(
        'payment.payment_purpose !==\n    "order"',
        walletAckPos
      );

    const commerceProcessPos =
      momoSection.indexOf(
        "await processNormalizedPaymentResult({",
        commerceGuardPos
      );

    assert.ok(
      proofPos >= 0,
      "durable provider settlement proof must exist"
    );

    assert.ok(
      walletBranchPos > proofPos,
      "wallet top-up dispatch must happen after provider proof persistence"
    );

    assert.ok(
      walletRpcPos > walletBranchPos,
      "wallet top-up must invoke bounded PostgreSQL settlement authority"
    );

    assert.match(
      momoSection.slice(
        walletBranchPos,
        walletAckPos
      ),
      /p_payment_transaction_id:\s*payment\.id/
    );

    assert.match(
      momoSection.slice(
        walletRpcPos,
        walletAckPos
      ),
      /WALLET_TOPUP_SETTLEMENT_FAILED/
    );

    assert.ok(
      walletAckPos > walletRpcPos,
      "MoMo ACK must happen only after Wallet settlement RPC succeeds"
    );

    assert.ok(
      commerceGuardPos > walletAckPos,
      "wallet top-up must return before commerce-purpose handling"
    );

    assert.ok(
      commerceProcessPos > commerceGuardPos,
      "commerce processing remains order-only"
    );

    assert.doesNotMatch(
      momoSection.slice(
        walletBranchPos,
        commerceGuardPos
      ),
      /processNormalizedPaymentResult\(/
    );

    assert.doesNotMatch(
      momoSection,
      /WALLET_TOPUP_SETTLEMENT_NOT_ENABLED/
    );

    assert.match(
      momoSection,
      /payment\.payment_purpose !==\s*"order"[\s\S]*PAYMENT_PURPOSE_INVALID/
    );
  }
);

test(
  "Zalo flow remains independent from MoMo verifier",
  () => {
    const zaloStart =
      route.indexOf(
        "async function processZaloCheckoutAsPaid"
      );

    assert.ok(
      zaloStart >= 0
    );

    const zaloSection =
      route.slice(
        zaloStart
      );

    assert.doesNotMatch(
      zaloSection,
      /verifyMomoSettlement\(/
    );
  }
);


test(
  "successful MoMo callback persists proof before ACK and ACKs before long business processing",
  () => {
    const momoStart =
      route.indexOf(
        "const momoIpnHandler"
      );

    const zaloStart =
      route.indexOf(
        "async function processZaloCheckoutAsPaid"
      );

    assert.ok(
      momoStart >= 0 &&
      zaloStart > momoStart
    );

    const momoSection =
      route.slice(
        momoStart,
        zaloStart
      );

    const verifyPos =
      momoSection.indexOf(
        "verifyMomoSettlement("
      );

    const proofPos =
      momoSection.indexOf(
        "settlement_verified_at:"
      );

    const ackPos =
      momoSection.indexOf(
        ".status(204)",
        proofPos
      );

    const processingPos =
      momoSection.indexOf(
        "await processNormalizedPaymentResult({",
        ackPos
      );

    assert.ok(
      verifyPos >= 0,
      "MoMo verification must exist"
    );

    assert.ok(
      proofPos > verifyPos,
      "durable settlement proof must follow verification"
    );

    assert.ok(
      ackPos > proofPos,
      "204 ACK must happen only after settlement proof"
    );

    assert.ok(
      processingPos > ackPos,
      "long commerce processing must happen after 204 ACK"
    );
  }
);

test(
  "valid MoMo IPN responses use HTTP 204 No Content",
  () => {
    const momoStart =
      route.indexOf(
        "const momoIpnHandler"
      );

    const zaloStart =
      route.indexOf(
        "async function processZaloCheckoutAsPaid"
      );

    const momoSection =
      route.slice(
        momoStart,
        zaloStart
      );

    assert.match(
      momoSection,
      /\.status\(204\)\s*\.send\(\)/
    );

    assert.doesNotMatch(
      momoSection,
      /res\.json\(\{\s*success:\s*true\s*,?\s*\}\)/
    );
  }
);

test(
  "successful MoMo settlement makes paid state durable before provider ACK",
  () => {
    const momoStart =
      route.indexOf(
        "const momoIpnHandler"
      );

    const zaloStart =
      route.indexOf(
        "async function processZaloCheckoutAsPaid"
      );

    const momoSection =
      route.slice(
        momoStart,
        zaloStart
      );

    const proofPos =
      momoSection.indexOf(
        "settlement_verified_at:"
      );

    const paidPos =
      momoSection.lastIndexOf(
        'payment_status:',
        proofPos
      );

    const paidValuePos =
      momoSection.indexOf(
        '"paid"',
        paidPos
      );

    const ackPos =
      momoSection.indexOf(
        ".status(204)",
        proofPos
      );

    const processPos =
      momoSection.indexOf(
        "await processNormalizedPaymentResult({",
        ackPos
      );

    assert.ok(
      paidPos >= 0 &&
      paidValuePos > paidPos &&
      paidValuePos < proofPos
    );

    assert.ok(
      ackPos > proofPos
    );

    assert.ok(
      processPos > ackPos
    );
  }
);

test(
  "signed failed MoMo result is durably failed before 204 ACK",
  () => {
    const momoStart =
      route.indexOf(
        "const momoIpnHandler"
      );

    const zaloStart =
      route.indexOf(
        "async function processZaloCheckoutAsPaid"
      );

    const momoSection =
      route.slice(
        momoStart,
        zaloStart
      );

    const failedBranch =
      momoSection.indexOf(
        "if (!verified.succeeded)"
      );

    const failedStatus =
      momoSection.indexOf(
        'payment_status:',
        failedBranch
      );

    const failedValue =
      momoSection.indexOf(
        '"failed"',
        failedStatus
      );

    const ack =
      momoSection.indexOf(
        ".status(204)",
        failedValue
      );

    assert.ok(
      failedBranch >= 0 &&
      failedStatus > failedBranch &&
      failedValue > failedStatus &&
      ack > failedValue
    );
  }
);
