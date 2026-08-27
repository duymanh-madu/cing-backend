const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const checkout =
  fs.readFileSync(
    "routes/checkoutRoutes.js",
    "utf8"
  );

const orchestrator =
  fs.readFileSync(
    "services/payment/paymentOrchestratorService.js",
    "utf8"
  );

test(
  "checkout create requires authenticated customer",
  () => {
    assert.match(
      checkout,
      /"\/create",[\s\S]*authMiddleware,[\s\S]*async \(req, res\)/
    );
  }
);

test(
  "checkout derives canonical commerce identity from authenticated phone",
  () => {
    assert.match(
      checkout,
      /canonicalUserId[\s\S]*normalizePhone\([\s\S]*req\.customer\?\.phone/
    );

    assert.match(
      checkout,
      /COMMERCE_CUSTOMER_IDENTITY_REQUIRED/
    );

    assert.doesNotMatch(
      checkout,
      /const \{[\s\S]{0,100}user_id,[\s\S]{0,300}customer_name/
    );
  }
);

test(
  "checkout payment and cart snapshot use canonical identity",
  () => {
    assert.match(
      checkout,
      /createPaymentSession\(\{[\s\S]*user_id:\s*canonicalUserId/
    );

    assert.match(
      checkout,
      /cart_snapshot:\s*\{[\s\S]*user_id:\s*canonicalUserId/
    );

    assert.match(
      checkout,
      /customer_phone:\s*canonicalUserId/
    );
  }
);

test(
  "checkout passes authoritative validated total through orchestrator contract",
  () => {
    assert.match(
      checkout,
      /total_amount:\s*validationResult\.total_amount/
    );

    assert.doesNotMatch(
      checkout,
      /createPaymentSession\(\{[\s\S]*?\bamount:\s*validationResult\.total_amount/
    );
  }
);

test(
  "cing wallet is settled through bounded wallet order service",
  () => {
    assert.match(
      checkout,
      /payment_method\s*===\s*"cing_wallet"[\s\S]*settleWalletOrderPayment\(\{[\s\S]*paymentTransactionId/
    );
  }
);

test(
  "orchestrator never dispatches cing wallet to external provider registry",
  () => {
    const walletBranch =
      orchestrator.indexOf(
        'payload.payment_method ===\n      "cing_wallet"'
      );

    const providerDispatch =
      orchestrator.indexOf(
        "getPaymentProvider("
      );

    assert.ok(
      walletBranch >= 0,
      "internal wallet branch missing"
    );

    assert.ok(
      providerDispatch >= 0,
      "external provider dispatch missing"
    );

    assert.ok(
      walletBranch < providerDispatch,
      "wallet must terminate before provider dispatch"
    );
  }
);

test(
  "wallet branch returns durable payment transaction for settlement handoff",
  () => {
    assert.match(
      orchestrator,
      /payload\.payment_method\s*===\s*"cing_wallet"[\s\S]*payment:\s*transaction/
    );
  }
);
