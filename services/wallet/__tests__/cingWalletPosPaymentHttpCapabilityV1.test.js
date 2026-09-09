"use strict";

const fs =
  require("node:fs");

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const serviceSource =
  fs.readFileSync(
    "services/wallet/cingWalletPosPaymentService.js",
    "utf8"
  );

const iposRouteSource =
  fs.readFileSync(
    "routes/iposCingWalletEpaymentRoutes.js",
    "utf8"
  );

const walletRouteSource =
  fs.readFileSync(
    "routes/walletRoutes.js",
    "utf8"
  );

const routeIndexSource =
  fs.readFileSync(
    "routes/index.js",
    "utf8"
  );


test(
  "iPOS Epayment router is mounted on dedicated boundary",
  () => {
    assert.match(
      routeIndexSource,
      /"\/ipos\/epayment\/cing-wallet"[\s\S]*iposCingWalletEpaymentRoutes/
    );
  }
);


test(
  "iPOS create and query require dedicated credential",
  () => {
    assert.match(
      iposRouteSource,
      /x-cing-wallet-epayment-key/
    );

    assert.match(
      iposRouteSource,
      /router\.post\(\s*"\/create",\s*requireIposCredential/
    );

    assert.match(
      iposRouteSource,
      /router\.post\(\s*"\/query",\s*requireIposCredential/
    );
  }
);


test(
  "POS security uses dedicated secrets and never reuses JWT secret",
  () => {
    assert.match(
      serviceSource,
      /CING_WALLET_POS_QR_SECRET/
    );

    assert.match(
      serviceSource,
      /CING_WALLET_IPOS_EPAYMENT_KEY/
    );

    assert.doesNotMatch(
      serviceSource,
      /JWT_SECRET/
    );
  }
);


test(
  "QR capability uses HMAC SHA256 and constant-time verification",
  () => {
    assert.match(
      serviceSource,
      /createHmac\(\s*"sha256"/
    );

    assert.match(
      serviceSource,
      /timingSafeEqual/
    );
  }
);


test(
  "QR capability contains payment token identity and expiry but no amount",
  () => {
    const functionMatch =
      serviceSource.match(
        /function createQrCapability\(\{([\s\S]*?)\n\}/
      );

    assert.ok(
      functionMatch
    );

    assert.match(
      functionMatch[1],
      /paymentTokenId/
    );

    assert.match(
      functionMatch[1],
      /expiresAt/
    );

    assert.doesNotMatch(
      functionMatch[1],
      /\bamount\b/
    );
  }
);


test(
  "iPOS create builds deterministic provider identity from POS transaction identity",
  () => {
    assert.match(
      serviceSource,
      /buildProviderRequestKey\(\{[\s\S]*transactionId[\s\S]*posParent[\s\S]*posId/
    );

    assert.match(
      serviceSource,
      /cing_wallet_create_pos_payment_intent_v1/
    );
  }
);


test(
  "iPOS query uses bounded database query authority",
  () => {
    assert.match(
      serviceSource,
      /cing_wallet_query_pos_payment_intent_v1/
    );
  }
);


test(
  "customer preview is authenticated and amount is not accepted from caller",
  () => {
    assert.match(
      walletRouteSource,
      /router\.get\(\s*"\/pos-pay\/:capability",\s*authMiddleware/
    );

    assert.match(
      walletRouteSource,
      /previewCustomerPosPayment\(\{[\s\S]*customer:\s*req\.customer[\s\S]*capability:\s*req\.params\?\.capability/
    );

    assert.doesNotMatch(
      walletRouteSource,
      /previewCustomerPosPayment\(\{[\s\S]{0,300}\bamount\s*:/
    );
  }
);


test(
  "customer confirm is authenticated and supplies no user or amount",
  () => {
    assert.match(
      walletRouteSource,
      /router\.post\(\s*"\/pos-pay\/:capability\/confirm",\s*authMiddleware/
    );

    const match =
      walletRouteSource.match(
        /confirmCustomerPosPayment\(\{([\s\S]*?)\}\);/
      );

    assert.ok(
      match
    );

    assert.match(
      match[1],
      /customer:\s*req\.customer/
    );

    assert.match(
      match[1],
      /capability:\s*req\.params\?\.capability/
    );

    assert.doesNotMatch(
      match[1],
      /\buser_id\b|\bamount\b/
    );
  }
);


test(
  "customer identity derives only from authenticated customer phone",
  () => {
    assert.match(
      serviceSource,
      /normalizePhone\(\s*customer\?\.phone \|\| ""\s*\)/
    );
  }
);


test(
  "customer preview uses bounded database authority",
  () => {
    assert.match(
      serviceSource,
      /cing_wallet_get_pos_payment_for_customer_v1/
    );
  }
);


test(
  "customer confirm uses atomic POS settlement authority",
  () => {
    assert.match(
      serviceSource,
      /cing_wallet_settle_pos_payment_atomic_v1/
    );

    assert.doesNotMatch(
      serviceSource,
      /\.from\(\s*["']cing_wallet_accounts["']/
    );

    assert.doesNotMatch(
      serviceSource,
      /\.from\(\s*["']cing_wallet_transactions["']/
    );
  }
);


test(
  "insufficient Wallet balance maps to explicit non-success response",
  () => {
    assert.match(
      serviceSource,
      /CING_WALLET_INSUFFICIENT_BALANCE[\s\S]*statusCode:\s*409/
    );
  }
);


test(
  "create response exposes QR content but no internal payment token id",
  () => {
    const createReturn =
      serviceSource.match(
        /async function createIposPosPayment[\s\S]*?return \{([\s\S]*?)\n  \};/
      );

    assert.ok(
      createReturn
    );

    assert.match(
      createReturn[1],
      /qr_content/
    );

    assert.doesNotMatch(
      createReturn[1],
      /payment_token_id/
    );
  }
);


test(
  "signed capability has strict expiry handling",
  () => {
    assert.match(
      serviceSource,
      /CING_WALLET_POS_PAYMENT_EXPIRED/
    );

    assert.match(
      serviceSource,
      /expirySeconds <=[\s\S]*nowSeconds/
    );
  }
);


test(
  "iPOS Epayment production surface is fail-closed behind explicit runtime gate",
  () => {
    assert.match(
      serviceSource,
      /CING_WALLET_POS_EPAYMENT_ENABLED/
    );

    assert.match(
      serviceSource,
      /CING_WALLET_POS_EP_PAYMENT_DISABLED/
    );

    assert.match(
      iposRouteSource,
      /assertPosEpaymentEnabled\(\)[\s\S]*assertIposEpaymentCredential/
    );
  }
);


test(
  "runtime gate has no enabled-by-default fallback",
  () => {
    assert.doesNotMatch(
      serviceSource,
      /CING_WALLET_POS_EPAYMENT_ENABLED\s*\|\|\s*["']true["']/
    );

    assert.match(
      serviceSource,
      /\.toLowerCase\(\)\s*===\s*["']true["']/
    );
  }
);
