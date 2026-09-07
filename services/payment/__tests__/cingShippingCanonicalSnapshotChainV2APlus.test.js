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

const checkout =
  read(
    "routes/checkoutRoutes.js"
  );

const payment =
  read(
    "services/paymentService.js"
  );

const settlement =
  read(
    "services/payment/paidOrderSettlementProcessor.js"
  );

test(
  "checkout freezes selected canonical pin",
  () => {
    assert.match(
      checkout,
      /delivery_latitude:[\s\S]*canonicalDeliveryLocation\.delivery_latitude/
    );

    assert.match(
      checkout,
      /delivery_longitude:[\s\S]*canonicalDeliveryLocation\.delivery_longitude/
    );

    assert.match(
      checkout,
      /delivery_location_source:[\s\S]*canonicalDeliveryLocation\.delivery_location_source/
    );
  }
);

test(
  "payment layer preserves checkout snapshot instead of projecting a subset",
  () => {
    assert.match(
      payment,
      /\.\.\.\(cart_snapshot\s*\|\|\s*\{\}\)/
    );
  }
);

test(
  "paid settlement consumes preserved canonical pin",
  () => {
    assert.match(
      settlement,
      /delivery_latitude:[\s\S]*snap\.delivery_latitude/
    );

    assert.match(
      settlement,
      /delivery_longitude:[\s\S]*snap\.delivery_longitude/
    );

    assert.match(
      settlement,
      /delivery_location_source:[\s\S]*snap\.delivery_location_source/
    );
  }
);
