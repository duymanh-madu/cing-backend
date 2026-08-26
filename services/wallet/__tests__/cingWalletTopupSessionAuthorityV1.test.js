const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");


const service =
  fs.readFileSync(
    "services/wallet/cingWalletTopupSessionService.js",
    "utf8"
  );

const route =
  fs.readFileSync(
    "routes/walletRoutes.js",
    "utf8"
  );

const routeIndex =
  fs.readFileSync(
    "routes/index.js",
    "utf8"
  );

const publicPaymentRoute =
  fs.readFileSync(
    "routes/paymentRoutes.js",
    "utf8"
  );


test(
  "wallet top-up session is authenticated",
  () => {
    assert.match(
      route,
      /router\.post\([\s\S]*"\/topup\/session"[\s\S]*authMiddleware/
    );

    assert.match(
      route,
      /customer:\s*req\.customer/
    );
  }
);


test(
  "wallet top-up identity derives only from authenticated customer phone",
  () => {
    assert.match(
      service,
      /normalizePhone\([\s\S]*customer\?\.phone/
    );

    assert.match(
      service,
      /resolveWalletUserId\([\s\S]*customer/
    );

    assert.doesNotMatch(
      route,
      /req\.body\?*\.user_id/
    );

    assert.doesNotMatch(
      route,
      /\.\.\.req\.body/
    );
  }
);


test(
  "wallet top-up requires canonical player identity",
  () => {
    assert.match(
      service,
      /\.from\([\s\S]*"players"[\s\S]*\)[\s\S]*\.select\([\s\S]*"user_id"[\s\S]*\)[\s\S]*\.eq\([\s\S]*"user_id"[\s\S]*userId/
    );

    assert.match(
      service,
      /CING_WALLET_PLAYER_NOT_FOUND/
    );

    assert.match(
      service,
      /CING_WALLET_PLAYER_IDENTITY_MISMATCH/
    );
  }
);


test(
  "wallet top-up accepts positive safe whole-VND amounts only",
  () => {
    assert.match(
      service,
      /Number\.isSafeInteger\([\s\S]*amount/
    );

    assert.match(
      service,
      /amount <= 0/
    );

    assert.match(
      service,
      /CING_WALLET_TOPUP_AMOUNT_INVALID/
    );

    assert.match(
      service,
      /\^\[0-9\]\+\$/
    );
  }
);


test(
  "wallet top-up payment authority is backend hard-bound",
  () => {
    assert.match(
      service,
      /payment_provider:\s*"momo"/
    );

    assert.match(
      service,
      /payment_method:\s*"momo"/
    );

    assert.match(
      service,
      /payment_purpose:\s*"wallet_topup"/
    );

    assert.match(
      service,
      /total_amount:\s*normalizedAmount/
    );
  }
);


test(
  "caller cannot redefine wallet payment authority",
  () => {
    assert.doesNotMatch(
      route,
      /payment_provider/
    );

    assert.doesNotMatch(
      route,
      /payment_method/
    );

    assert.doesNotMatch(
      route,
      /payment_purpose/
    );

    assert.doesNotMatch(
      route,
      /cart_snapshot/
    );

    assert.doesNotMatch(
      service,
      /\.\.\.(?:body|payload|req\.body)/
    );
  }
);


test(
  "wallet top-up session does not fabricate commerce order data",
  () => {
    assert.doesNotMatch(
      service,
      /\.from\([\s\S]*"orders"/
    );

    assert.doesNotMatch(
      service,
      /order_code/
    );

    assert.doesNotMatch(
      service,
      /shipping_fee/
    );

    assert.doesNotMatch(
      service,
      /subtotal/
    );

    assert.doesNotMatch(
      service,
      /items:/
    );

    assert.match(
      service,
      /cart_snapshot:\s*\{[\s\S]*purpose:\s*"wallet_topup"/
    );
  }
);


test(
  "wallet top-up session is mounted under dedicated wallet namespace",
  () => {
    assert.match(
      routeIndex,
      /router\.use\([\s\S]*"\/wallet"[\s\S]*require\("\.\/walletRoutes"\)/
    );
  }
);


test(
  "public generic payment session remains commerce-order only",
  () => {
    assert.match(
      publicPaymentRoute,
      /createPaymentSession\(\{[\s\S]*\.\.\.req\.body[\s\S]*payment_purpose:\s*"order"/
    );

    assert.doesNotMatch(
      publicPaymentRoute,
      /payment_purpose:\s*"wallet_topup"/
    );
  }
);


test(
  "wallet top-up session delegates to shared payment orchestrator",
  () => {
    assert.match(
      service,
      /createPaymentSession\(\{/
    );

    assert.doesNotMatch(
      service,
      /payment_transactions[\s\S]*\.insert/
    );
  }
);
