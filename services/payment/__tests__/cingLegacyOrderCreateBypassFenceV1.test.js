"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const source =
  fs.readFileSync(
    "routes/orderRoutes.js",
    "utf8"
  );


function createRouteRegion() {

  const start =
    source.search(
      /router\.post\(\s*["']\/create["']/
    );

  assert.ok(
    start >= 0
  );


  const remainder =
    source.slice(start + 1);

  const nextMatch =
    remainder.match(
      /\nrouter\.(?:get|post|put|delete|patch)\(/
    );

  assert.ok(
    nextMatch
  );


  const end =
    start +
    1 +
    nextMatch.index;

  return source.slice(
    start,
    end
  );

}


test(
  "legacy orders create endpoint remains authenticated",
  () => {

    const route =
      createRouteRegion();

    assert.match(
      route,
      /authMiddleware/
    );

    assert.match(
      route,
      /COMMERCE_CUSTOMER_IDENTITY_REQUIRED/
    );

  }
);


test(
  "legacy orders create endpoint is terminal 410",
  () => {

    const route =
      createRouteRegion();

    assert.match(
      route,
      /status\(410\)/
    );

    assert.match(
      route,
      /COMMERCE_CHECKOUT_ENDPOINT_REQUIRED/
    );

    assert.match(
      route,
      /\/api\/checkout\/create/
    );

  }
);


test(
  "legacy orders create endpoint performs zero order mutation",
  () => {

    const route =
      createRouteRegion();

    assert.doesNotMatch(
      route,
      /createOrder\(/
    );

    assert.doesNotMatch(
      route,
      /\.insert\(/
    );

    assert.doesNotMatch(
      route,
      /\.update\(/
    );

    assert.doesNotMatch(
      route,
      /\.delete\(/
    );

    assert.doesNotMatch(
      route,
      /\.upsert\(/
    );

  }
);


test(
  "orderRoutes no longer imports direct order creation authority",
  () => {

    assert.doesNotMatch(
      source,
      /createOrder/
    );

    assert.doesNotMatch(
      source,
      /services\/orderService/
    );

  }
);
