"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const walletMigration =
  fs.readFileSync(
    "db/migrations/20260827_cing_wallet_order_payment_settlement_authority_v1.sql",
    "utf8"
  );

const provider =
  fs.readFileSync(
    "services/payment/providers/zaloCheckoutProvider.js",
    "utf8"
  );

const pointsOnly =
  fs.readFileSync(
    "db/migrations/20260907_commerce_points_only_settlement_authority_v1.sql",
    "utf8"
  );


test(
  "Wallet financial authority continues rejecting zero amount",
  () => {

    assert.match(
      walletMigration,
      /v_payment\.amount <= 0/i
    );

  }
);


test(
  "points-only funding has a dedicated internal authority",
  () => {

    assert.match(
      pointsOnly,
      /payment_method[\s\S]*points/i
    );

    assert.match(
      pointsOnly,
      /payment_provider[\s\S]*internal/i
    );

  }
);


test(
  "points-only authority never delegates to provider implementation",
  () => {

    assert.doesNotMatch(
      pointsOnly,
      /zaloCheckoutProvider|provider\.createPayment|momoProvider/i
    );

  }
);


test(
  "provider implementation remains separate from points-only authority",
  () => {

    assert.match(
      provider,
      /async function createPayment/
    );

    assert.doesNotMatch(
      pointsOnly,
      /createPayment\(/
    );

  }
);
