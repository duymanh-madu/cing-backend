const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const migration =
  fs.readFileSync(
    "db/migrations/20260907_wallet_topup_reconciliation_dual_provider_v2.sql",
    "utf8"
  );

const worker =
  fs.readFileSync(
    "services/payment/workers/walletTopupReconciliationWorker.js",
    "utf8"
  );

const topup =
  fs.readFileSync(
    "services/wallet/cingWalletTopupSessionService.js",
    "utf8"
  );

const reconciliation =
  fs.readFileSync(
    "services/payment/paymentReconciliationService.js",
    "utf8"
  );


test(
  "new Wallet topup creation uses Zalo entitlement while legacy MoMo entitlement remains recoverable",
  () => {
    assert.match(
      topup,
      /assertWalletZaloCheckoutTopupEnabled/
    );

    assert.doesNotMatch(
      topup,
      /assertWalletMomoTopupEnabled/
    );

    assert.match(
      worker,
      /entitlements\.momo/
    );

    assert.match(
      worker,
      /entitlements\.zalo_checkout/
    );
  }
);


test(
  "V2 auto enrollment covers exactly supported Wallet topup providers",
  () => {
    assert.match(
      migration,
      /payment_purpose = 'wallet_topup'[\s\S]*'momo'[\s\S]*'zalo_checkout'/
    );

    assert.match(
      migration,
      /payment_wallet_topup_reconciliation_enroll_v2/
    );
  }
);


test(
  "V2 durable claim returns canonical provider and uses independent provider entitlements",
  () => {
    assert.match(
      migration,
      /cing_payment_claim_wallet_topup_reconciliation_v2/
    );

    assert.match(
      migration,
      /payment_provider text/
    );

    assert.match(
      migration,
      /p_allow_momo boolean/
    );

    assert.match(
      migration,
      /p_allow_zalo_checkout boolean/
    );

    assert.match(
      migration,
      /for update of j[\s\S]*skip locked/
    );
  }
);


test(
  "worker dispatches MoMo and Zalo to different server authorities",
  () => {
    assert.match(
      worker,
      /provider === "momo"[\s\S]*queryMomoTransaction/
    );

    assert.match(
      worker,
      /provider ===[\s\S]*"zalo_checkout"[\s\S]*queryZaloCheckoutTransaction/
    );
  }
);


test(
  "provider success proof is rebound through provider-specific PostgreSQL authority",
  () => {
    assert.match(
      worker,
      /cing_payment_accept_momo_query_success_v1/
    );

    assert.match(
      worker,
      /cing_payment_accept_zalo_checkout_query_success_v2/
    );

    assert.match(
      migration,
      /v_payment\.amount::bigint <>[\s\S]*p_provider_amount/
    );

    assert.match(
      migration,
      /zalo_checkout_status_query_v2/
    );
  }
);


test(
  "terminal failure V2 covers both providers but can never downgrade durable success",
  () => {
    assert.match(
      worker,
      /cing_payment_terminal_fail_wallet_topup_reconciliation_v2/
    );

    assert.match(
      migration,
      /not in \([\s\S]*'momo'[\s\S]*'zalo_checkout'/
    );

    assert.match(
      migration,
      /settlement_verified_at[\s\S]*settlement_consumed_at[\s\S]*payment_status[\s\S]*WALLET_TOPUP_RECONCILIATION_SUCCESS_ALREADY_DURABLE/
    );
  }
);


test(
  "manual reconciliation stays customer-owned and provider scoped",
  () => {
    assert.match(
      reconciliation,
      /findOwnedPaymentByCode/
    );

    assert.match(
      reconciliation,
      /cing_payment_ensure_wallet_topup_reconciliation_v2/
    );

    assert.match(
      reconciliation,
      /"momo"[\s\S]*"zalo_checkout"/
    );

    assert.match(
      reconciliation,
      /assertWalletTopupProviderEnabled\(provider\)/
    );
  }
);


test(
  "V2 financial functions remain inaccessible to client roles",
  () => {
    for (
      const signature of [
        "cing_payment_ensure_wallet_topup_reconciliation_v2",
        "cing_payment_claim_wallet_topup_reconciliation_v2",
        "cing_payment_accept_zalo_checkout_query_success_v2",
        "cing_payment_terminal_fail_wallet_topup_reconciliation_v2",
      ]
    ) {
      assert.match(
        migration,
        new RegExp(
          `revoke all on function[\\s\\S]*?${signature}[\\s\\S]*?from public, anon, authenticated`,
          "i"
        )
      );
    }
  }
);
