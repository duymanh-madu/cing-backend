"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


function read(path) {
  return fs.readFileSync(
    path,
    "utf8"
  );
}


const migration =
  read(
    "supabase/migrations/20260908183000_commerce_checkout_request_idempotency_v1.sql"
  );

const checkout =
  read(
    "routes/checkoutRoutes.js"
  );

const transaction =
  read(
    "services/payment/paymentTransactionService.js"
  );

const orchestrator =
  read(
    "services/payment/paymentOrchestratorService.js"
  );

const consume =
  read(
    "services/deliveryLocationCandidateConsumeService.js"
  );

const fingerprint =
  read(
    "services/payment/commerceCheckoutFingerprintService.js"
  );


test(
  "payment transaction has durable order request uniqueness",
  () => {
    assert.match(
      migration,
      /checkout_request_id uuid/
    );

    assert.match(
      migration,
      /checkout_fingerprint text/
    );

    assert.match(
      migration,
      /payment_transactions_order_checkout_request_uq/
    );

    assert.match(
      migration,
      /user_id[\s\S]*checkout_request_id/
    );

    assert.match(
      migration,
      /payment_purpose = 'order'/
    );
  }
);


test(
  "candidate consume V2 makes same-request retry idempotent only",
  () => {
    assert.match(
      migration,
      /cing_commerce_consume_delivery_location_candidate_v2/
    );

    assert.match(
      migration,
      /v_existing\.checkout_request_id[\s\S]*p_checkout_request_id/
    );

    assert.match(
      migration,
      /'idempotent'[\s\S]*true/
    );

    assert.match(
      migration,
      /'consumed'[\s\S]*false[\s\S]*'replayed'[\s\S]*true/
    );

    assert.match(
      consume,
      /p_checkout_request_id/
    );

    assert.match(
      consume,
      /idempotentReplay/
    );
  }
);


test(
  "checkout accepts stable UUID while legacy client gets one-shot compatibility",
  () => {
    assert.match(
      checkout,
      /checkout_request_id/
    );

    assert.match(
      checkout,
      /crypto\.randomUUID/
    );

    assert.match(
      checkout,
      /COMMERCE_CHECKOUT_REQUEST_ID_INVALID/
    );
  }
);


test(
  "fingerprint contains canonical destination and financial authority only",
  () => {
    assert.match(
      checkout,
      /createCommerceCheckoutFingerprint/
    );

    for (
      const marker of [
        "candidate_jti",
        "destination_latitude",
        "destination_longitude",
        "items",
        "points_used",
        "shipping_fee",
        "distance_km",
        "total_amount",
        "payment_method",
        "payment_provider",
      ]
    ) {
      assert.match(
        checkout,
        new RegExp(marker)
      );
    }

    assert.doesNotMatch(
      checkout,
      /createCommerceCheckoutFingerprint\([\s\S]*submitted_shipping_fee/
    );

    assert.doesNotMatch(
      checkout,
      /createCommerceCheckoutFingerprint\([\s\S]*submitted_total_amount/
    );

    assert.match(
      fingerprint,
      /sha256/
    );

    assert.match(
      fingerprint,
      /Object[\s\S]*keys[\s\S]*sort/
    );
  }
);


test(
  "same request and fingerprint reuses the existing payment row",
  () => {
    assert.match(
      transaction,
      /checkout_request_id/
    );

    assert.match(
      transaction,
      /checkout_fingerprint/
    );

    assert.match(
      transaction,
      /23505/
    );

    assert.match(
      transaction,
      /_checkout_replayed/
    );

    assert.match(
      transaction,
      /COMMERCE_CHECKOUT_IDEMPOTENCY_CONFLICT/
    );
  }
);


test(
  "external provider creation is protected by replay recovery fence",
  () => {
    const replay =
      orchestrator.indexOf(
        "storedProviderResponse"
      );

    const create =
      orchestrator.indexOf(
        "await provider.createPayment("
      );

    assert.ok(
      replay >= 0
    );

    assert.ok(
      create > replay
    );

    assert.match(
      orchestrator,
      /COMMERCE_PAYMENT_SESSION_REPLAY_RECOVERY_REQUIRED/
    );
  }
);


test(
  "one request identity binds candidate and payment",
  () => {
    assert.match(
      checkout,
      /consumeDeliveryLocationCandidate\(\{[\s\S]*checkout_request_id:[\s\S]*checkoutRequestId/
    );

    assert.match(
      checkout,
      /createPaymentSession\(\{[\s\S]*checkout_request_id:[\s\S]*checkoutRequestId/
    );

    assert.match(
      checkout,
      /checkout_fingerprint:[\s\S]*checkoutFingerprint/
    );
  }
);
