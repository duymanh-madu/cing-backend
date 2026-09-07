"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const validation =
  fs.readFileSync(
    "services/checkoutValidationService.js",
    "utf8"
  );

const route =
  fs.readFileSync(
    "routes/checkoutRoutes.js",
    "utf8"
  );

const settlement =
  fs.readFileSync(
    "services/payment/paidOrderSettlementProcessor.js",
    "utf8"
  );


test(
  "checkout imports canonical merchandise authority",
  () => {

    assert.match(
      validation,
      /resolveCanonicalMerchandisePricing/
    );

  }
);


test(
  "client item price subtotal authority is gone",
  () => {

    assert.doesNotMatch(
      validation,
      /item\.price\s*\|\|\s*0/
    );

    assert.doesNotMatch(
      validation,
      /function calculateSubtotal/
    );

  }
);


test(
  "canonical merchandise resolves before minimum order shipping voucher and tier pricing",
  () => {

    const pricing =
      validation.indexOf(
        "await resolveCanonicalMerchandisePricing"
      );

    const minimum =
      validation.indexOf(
        "MINIMUM ORDER"
      );

    const shipping =
      validation.indexOf(
        "const shippingResult"
      );

    const voucher =
      validation.indexOf(
        "let voucher_discount"
      );

    const tier =
      validation.indexOf(
        "await resolveCanonicalCommerceTier",
        voucher
      );

    assert.ok(pricing >= 0);
    assert.ok(minimum > pricing);
    assert.ok(shipping > minimum);
    assert.ok(voucher > shipping);
    assert.ok(tier > voucher);

  }
);


test(
  "delivery configuration and coordinates only gate delivery orders",
  () => {

    assert.match(
      validation,
      /requiresDelivery\s*&&\s*!config\.delivery_enabled/
    );

    assert.match(
      validation,
      /requiresDelivery\s*&&\s*!validateCoordinates/
    );

  }
);


test(
  "pickup and dine_in are explicit valid fulfillment types",
  () => {

    assert.match(
      validation,
      /"delivery"[\s\S]*"pickup"[\s\S]*"dine_in"/
    );

  }
);


test(
  "checkout success returns canonical items",
  () => {

    assert.match(
      validation,
      /items:\s*canonicalItems/
    );

  }
);


test(
  "payment snapshot freezes validationResult items rather than raw request items",
  () => {

    assert.match(
      route,
      /items:\s*validationResult\.items/
    );

  }
);


test(
  "settlement has only one subtotal key in order insert",
  () => {

    const anchor =
      settlement.indexOf(
        '.from("orders")'
      );

    const insert =
      settlement.indexOf(
        ".insert({",
        anchor
      );

    const select =
      settlement.indexOf(
        ".select()",
        insert
      );

    const region =
      settlement.slice(
        insert,
        select
      );

    const count =
      (
        region.match(
          /^\s*subtotal\s*:/gm
        ) || []
      ).length;

    assert.equal(
      count,
      1
    );

  }
);


test(
  "settlement preserves zero-valued financial fields",
  () => {

    assert.match(
      settlement,
      /snap\.subtotal\s*\?\?/
    );

    assert.match(
      settlement,
      /snap\.shipping_fee\s*\?\?/
    );

    assert.match(
      settlement,
      /snap\.tier_discount\s*\?\?/
    );

    assert.match(
      settlement,
      /snap\.points_discount\s*\?\?/
    );

  }
);
