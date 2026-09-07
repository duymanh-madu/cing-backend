"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const paymentRoute =
  fs.readFileSync(
    "routes/paymentRoutes.js",
    "utf8"
  );

const checkoutRoute =
  fs.readFileSync(
    "routes/checkoutRoutes.js",
    "utf8"
  );

const topupService =
  fs.readFileSync(
    "services/wallet/cingWalletTopupSessionService.js",
    "utf8"
  );


function createSessionRegion() {

  const start =
    paymentRoute.indexOf(
      '"/create-session"'
    );

  const end =
    paymentRoute.indexOf(
      "RECOVER PAYMENT",
      start
    );

  assert.ok(start >= 0);
  assert.ok(end > start);

  return paymentRoute.slice(
    start,
    end
  );

}


test(
  "public create-session remains authenticated but is terminally deprecated",
  () => {

    const region =
      createSessionRegion();

    assert.match(
      region,
      /authMiddleware/
    );

    assert.match(
      region,
      /normalizePhone\([\s\S]*req\.customer\?\.phone/
    );

    assert.match(
      region,
      /\.status\(410\)/
    );

    assert.match(
      region,
      /COMMERCE_CHECKOUT_ENDPOINT_REQUIRED/
    );

    assert.match(
      region,
      /\/api\/checkout\/create/
    );

  }
);


test(
  "deprecated public route cannot pass client financial fields into orchestrator",
  () => {

    const region =
      createSessionRegion();

    assert.doesNotMatch(
      region,
      /\.\.\.req\.body/
    );

    assert.doesNotMatch(
      region,
      /createPaymentSession\(/
    );

    assert.doesNotMatch(
      region,
      /total_amount|cart_snapshot|points_used|points_discount/
    );

  }
);


test(
  "paymentRoutes no longer imports payment creation authority",
  () => {

    assert.doesNotMatch(
      paymentRoute,
      /paymentOrchestratorService/
    );

    assert.doesNotMatch(
      paymentRoute,
      /\bcreatePaymentSession\b/
    );

  }
);


test(
  "canonical checkout remains the order financial entrypoint",
  () => {

    assert.match(
      checkoutRoute,
      /await validateCheckout\(\{/
    );

    assert.match(
      checkoutRoute,
      /canonicalPaymentMethod/
    );

    assert.match(
      checkoutRoute,
      /canonicalPaymentProvider/
    );

    assert.match(
      checkoutRoute,
      /await createPaymentSession\(\{/
    );

    assert.match(
      checkoutRoute,
      /payment_purpose:[\s\S]*"order"/
    );

    assert.match(
      checkoutRoute,
      /total_amount:[\s\S]*validationResult\.total_amount/
    );

    assert.match(
      checkoutRoute,
      /cart_snapshot:[\s\S]*validationResult\.items/
    );

  }
);


test(
  "Wallet topup retains dedicated backend-owned orchestrator path",
  () => {

    assert.match(
      topupService,
      /await createPaymentSession\(\{/
    );

    assert.match(
      topupService,
      /payment_purpose:[\s\S]*"wallet_topup"/
    );

    assert.match(
      topupService,
      /total_amount:[\s\S]*normalizedAmount/
    );

    assert.doesNotMatch(
      topupService,
      /\.\.\.req\.body/
    );

  }
);
