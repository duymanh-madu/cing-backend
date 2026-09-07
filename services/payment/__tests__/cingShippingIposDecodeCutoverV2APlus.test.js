"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

function read(file) {
  return fs.readFileSync(
    file,
    "utf8"
  );
}

const ipos =
  read(
    "services/iposOrderService.js"
  );

const shippingRoutes =
  read(
    "routes/shippingRoutes.js"
  );

test(
  "iPOS receives durable canonical delivery pin",
  () => {
    assert.match(
      ipos,
      /order\.delivery_latitude/
    );

    assert.match(
      ipos,
      /order\.delivery_longitude/
    );

    assert.match(
      ipos,
      /order\.delivery_address_detail/
    );

    assert.doesNotMatch(
      ipos,
      /if\s*\(\s*order\.latitude\s*\)/
    );

    assert.doesNotMatch(
      ipos,
      /if\s*\(\s*order\.longitude\s*\)/
    );
  }
);

test(
  "decode-location owns coordinate decoding only",
  () => {
    const start =
      shippingRoutes.indexOf(
        'router.post("/decode-location"'
      );

    assert.notEqual(
      start,
      -1
    );

    const region =
      shippingRoutes.slice(
        start
      );

    assert.match(
      region,
      /latitude/
    );

    assert.match(
      region,
      /longitude/
    );

    assert.doesNotMatch(
      region,
      /shipping_tiers/
    );

    assert.doesNotMatch(
      region,
      /shipping_fee_per_km/
    );

    assert.doesNotMatch(
      region,
      /ship_fee/
    );

    assert.doesNotMatch(
      region,
      /getEstimateShipFee/
    );
  }
);
