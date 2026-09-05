const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");


const reconciliation =
  fs.readFileSync(
    path.join(
      __dirname,
      "../paymentReconciliationService.js"
    ),
    "utf8"
  );

const retryService =
  fs.readFileSync(
    path.join(
      __dirname,
      "../paymentRetryService.js"
    ),
    "utf8"
  );

const worker =
  fs.readFileSync(
    path.join(
      __dirname,
      "../workers/walletTopupReconciliationWorker.js"
    ),
    "utf8"
  );


test(
  "broken reconcilePayment contract is restored",
  () => {
    assert.match(
      reconciliation,
      /async function reconcilePayment/
    );

    assert.match(
      reconciliation,
      /module\.exports[\s\S]*reconcilePayment/
    );

    assert.match(
      retryService,
      /reconcilePayment/
    );
  }
);


test(
  "manual reconciliation delegates through ownership guard into PostgreSQL durable enrollment",
  () => {
    assert.match(
      reconciliation,
      /findOwnedPaymentByCode/
    );

    assert.doesNotMatch(
      reconciliation,
      /findTransactionByCode/
    );

    assert.match(
      reconciliation,
      /cing_payment_ensure_wallet_topup_reconciliation_v1/
    );

    assert.doesNotMatch(
      reconciliation,
      /queryMomoTransaction/
    );

    assert.doesNotMatch(
      reconciliation,
      /cing_payment_claim_wallet_topup_reconciliation_v1/
    );

    assert.doesNotMatch(
      reconciliation,
      /cing_wallet_settle_verified_topup_atomic/
    );

    assert.doesNotMatch(
      reconciliation,
      /runWalletTopupReconciliationOnce/
    );
  }
);


test(
  "manual adapter cannot bypass Wallet MoMo deployment entitlement",
  () => {
    const functionStart =
      reconciliation.indexOf(
        "async function reconcilePayment({"
      );

    const functionEnd =
      reconciliation.indexOf(
        "module.exports",
        functionStart
      );

    const section =
      reconciliation.slice(
        functionStart,
        functionEnd
      );

    const gate =
      section.indexOf(
        "assertWalletMomoTopupEnabled();"
      );

    const enrollment =
      section.indexOf(
        "ensureWalletTopupReconciliation("
      );

    assert.ok(
      gate >= 0
    );

    assert.ok(
      enrollment >= 0
    );

    assert.ok(
      gate < enrollment
    );
  }
);


test(
  "Wallet reconciliation is purpose and provider scoped",
  () => {
    assert.match(
      reconciliation,
      /payment\.payment_purpose !==[\s\S]*"wallet_topup"/
    );

    assert.match(
      reconciliation,
      /payment\.payment_provider[\s\S]*"momo"/
    );

    assert.match(
      reconciliation,
      /PAYMENT_RECONCILIATION_UNSUPPORTED/
    );
  }
);


test(
  "RAM retry queue is not Wallet financial authority",
  () => {
    assert.doesNotMatch(
      reconciliation,
      /paymentRetryQueueService|retryQueue\.push|enqueueRetryPayment/
    );

    assert.doesNotMatch(
      worker,
      /paymentRetryQueueService|retryQueue\.push|enqueueRetryPayment/
    );
  }
);
