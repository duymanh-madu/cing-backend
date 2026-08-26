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

const settlementMigration =
  fs.readFileSync(
    "db/migrations/20260827_cing_wallet_topup_settlement_authority_v1.sql",
    "utf8"
  );

function getMomoSection() {
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
    zaloStart > momoStart,
    "MoMo handler boundary missing"
  );

  return route.slice(
    momoStart,
    zaloStart
  );
}

test(
  "wallet top-up RPC failure is not ACKed and remains retryable",
  () => {
    const momo =
      getMomoSection();

    const walletBranch =
      momo.indexOf(
        'payment.payment_purpose ===\n    "wallet_topup"'
      );

    const rpc =
      momo.indexOf(
        '"cing_wallet_settle_verified_topup_atomic"',
        walletBranch
      );

    const rpcError =
      momo.indexOf(
        "walletTopupSettlementError",
        rpc
      );

    const failureResponse =
      momo.indexOf(
        "WALLET_TOPUP_SETTLEMENT_FAILED",
        rpcError
      );

    const errorStatus =
      momo.lastIndexOf(
        "res.status(500)",
        failureResponse
      );

    const successAck =
      momo.indexOf(
        ".status(204)",
        failureResponse
      );

    assert.ok(
      walletBranch >= 0,
      "wallet top-up branch missing"
    );

    assert.ok(
      rpc > walletBranch,
      "Wallet settlement RPC must execute inside wallet branch"
    );

    assert.ok(
      rpcError > rpc,
      "RPC error path missing"
    );

    assert.ok(
      failureResponse > rpcError,
      "bounded Wallet failure response missing"
    );

    assert.ok(
      errorStatus > rpc &&
      errorStatus < successAck,
      "RPC failure must return non-2xx before any 204 ACK"
    );

    const failureSection =
      momo.slice(
        rpcError,
        successAck
      );

    assert.doesNotMatch(
      failureSection,
      /\.status\(204\)/
    );

    assert.doesNotMatch(
      failureSection,
      /processNormalizedPaymentResult\(/
    );
  }
);

test(
  "wallet top-up retry uses stable authoritative payment identity",
  () => {
    const momo =
      getMomoSection();

    assert.match(
      momo,
      /"cing_wallet_settle_verified_topup_atomic"[\s\S]*p_payment_transaction_id:\s*payment\.id/
    );

    assert.doesNotMatch(
      momo,
      /cing_wallet_settle_verified_topup_atomic[\s\S]*p_user_id/
    );

    assert.doesNotMatch(
      momo,
      /cing_wallet_settle_verified_topup_atomic[\s\S]*p_amount/
    );
  }
);

test(
  "wallet top-up database authority is durably idempotent across webhook retry",
  () => {
    assert.match(
      settlementMigration,
      /for update/i
    );

    assert.match(
      settlementMigration,
      /'wallet_topup:payment:'[\s\S]*v_reference_id/i
    );

    assert.match(
      settlementMigration,
      /if v_payment\.settlement_consumed_at[\s\S]*is not null[\s\S]*cing_wallet_transactions[\s\S]*idempotency_key[\s\S]*return v_wallet_transaction/i
    );

    assert.match(
      settlementMigration,
      /cing_wallet_apply_mutation_private\([\s\S]*v_idempotency_key/i
    );

    assert.match(
      settlementMigration,
      /update public\.payment_transactions[\s\S]*settlement_consumed_at[\s\S]*is null/i
    );
  }
);

test(
  "wallet credit and settlement consumption remain one PostgreSQL transaction",
  () => {
    const mutationPos =
      settlementMigration.indexOf(
        "cing_wallet_apply_mutation_private("
      );

    const consumePos =
      settlementMigration.indexOf(
        "settlement_consumed_at =",
        mutationPos
      );

    const commitPos =
      settlementMigration.lastIndexOf(
        "commit;"
      );

    assert.ok(
      mutationPos >= 0,
      "Wallet private mutation missing"
    );

    assert.ok(
      consumePos > mutationPos,
      "settlement must be consumed only after Wallet mutation"
    );

    assert.ok(
      commitPos > consumePos,
      "Wallet mutation and consumption must share one transaction"
    );
  }
);

test(
  "wallet top-up retry can never enter order side effects",
  () => {
    const momo =
      getMomoSection();

    const walletBranch =
      momo.indexOf(
        'payment.payment_purpose ===\n    "wallet_topup"'
      );

    const commerceGuard =
      momo.indexOf(
        'payment.payment_purpose !==\n    "order"',
        walletBranch
      );

    const walletSection =
      momo.slice(
        walletBranch,
        commerceGuard
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
