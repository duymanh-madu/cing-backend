"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const source =
  fs.readFileSync(
    "services/iposOrderService.js",
    "utf8"
  );


test(
  "iPOS never reconstructs point value from points_used",
  () => {

    assert.doesNotMatch(
      source,
      /points_used\s*\*\s*1000/
    );

    assert.doesNotMatch(
      source,
      /1000\s*\*\s*points_used/
    );

  }
);


test(
  "iPOS consumes frozen points_discount directly",
  () => {

    assert.match(
      source,
      /order\.points_discount/
    );

    assert.match(
      source,
      /IPOS_POINTS_DISCOUNT_INVALID/
    );

  }
);


test(
  "Wallet tender remains CING_WALLET with canonical remainder",
  () => {

    const start =
      source.indexOf(
        'paymentMethod ===\n      "cing_wallet"'
      );

    const end =
      source.indexOf(
        'paymentMethod ===\n      "momo"',
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const region =
      source.slice(
        start,
        end
      );

    assert.match(
      region,
      /Payment_Method:[\s\S]*"CING_WALLET"/
    );

    assert.match(
      region,
      /Amount:[\s\S]*amount/
    );

  }
);


test(
  "MoMo tender remains MOMO_QR_AIO with canonical remainder",
  () => {

    const start =
      source.indexOf(
        'paymentMethod ===\n      "momo"'
      );

    const end =
      source.indexOf(
        'paymentMethod ===\n      "points"',
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const region =
      source.slice(
        start,
        end
      );

    assert.match(
      region,
      /Payment_Method:[\s\S]*"MOMO_QR_AIO"/
    );

    assert.match(
      region,
      /Amount:[\s\S]*amount/
    );

  }
);


test(
  "points-only can never masquerade as MoMo or Wallet",
  () => {

    const start =
      source.indexOf(
        'paymentMethod ===\n      "points"'
      );

    const end =
      source.indexOf(
        "IPOS_PAYMENT_METHOD_UNSUPPORTED",
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const region =
      source.slice(
        start,
        end
      );

    assert.doesNotMatch(
      region,
      /"MOMO_QR_AIO"|"CING_WALLET"/
    );

    assert.match(
      region,
      /IPOS_POINTS_PAYMENT_METHOD/
    );

    assert.match(
      region,
      /Amount:[\s\S]*0/
    );

  }
);


test(
  "points-only fails closed until iPOS-approved tender is configured",
  () => {

    assert.match(
      source,
      /IPOS_POINTS_PAYMENT_METHOD_REQUIRED/
    );

  }
);


test(
  "positive points require a canonical monetary discount",
  () => {

    assert.match(
      source,
      /canonicalPointsUsed > 0[\s\S]*canonicalPointsDiscount <= 0/
    );

    assert.match(
      source,
      /IPOS_POINTS_DISCOUNT_REQUIRED/
    );

  }
);


test(
  "iPOS top-level monetary amount is exact durable order remainder",
  () => {

    assert.match(
      source,
      /amount:[\s\S]*canonicalTotal/
    );

    assert.match(
      source,
      /total_amount:[\s\S]*canonicalTotal/
    );

  }
);
