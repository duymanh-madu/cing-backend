"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const source =
  fs.readFileSync(
    "routes/pointsRoutes.js",
    "utf8"
  );


function pointsPaymentRoute() {

  const start =
    source.search(
      /router\.post\(\s*["']\/pay-with-points["']/
    );

  assert.ok(
    start >= 0
  );


  const remainder =
    source.slice(
      start + 1
    );

  const next =
    remainder.match(
      /\nrouter\.(?:get|post|put|delete|patch)\(/
    );

  assert.ok(next);


  return source.slice(
    start,
    start +
      1 +
      next.index
  );

}


test(
  "legacy point commerce endpoint remains authenticated",
  () => {

    const route =
      pointsPaymentRoute();

    assert.match(
      route,
      /authMiddleware/
    );

  }
);


test(
  "legacy point commerce endpoint is terminal 410",
  () => {

    const route =
      pointsPaymentRoute();

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
  "legacy point commerce endpoint performs zero financial mutation",
  () => {

    const route =
      pointsPaymentRoute();

    assert.doesNotMatch(
      route,
      /deductPoints\(/
    );

    assert.doesNotMatch(
      route,
      /payment_status:\s*"paid"/
    );

    assert.doesNotMatch(
      route,
      /payment_method:\s*"points"/
    );

    assert.doesNotMatch(
      route,
      /pushOrderToIPOS/
    );

    assert.doesNotMatch(
      route,
      /\.update\(/
    );

    assert.doesNotMatch(
      route,
      /\.insert\(/
    );

    assert.doesNotMatch(
      route,
      /\.upsert\(/
    );

  }
);


test(
  "non-commerce point capabilities remain intact",
  () => {

    assert.match(
      source,
      /router\.post\("\/buy-plays"/
    );

    assert.match(
      source,
      /router\.post\("\/deduct"/
    );

    assert.match(
      source,
      /router\.post\("\/exchange-voucher"/
    );

  }
);


test(
  "point service authority remains available outside retired commerce route",
  () => {

    assert.match(
      source,
      /const\s*\{\s*deductPoints\s*\}\s*=\s*require/
    );

  }
);
