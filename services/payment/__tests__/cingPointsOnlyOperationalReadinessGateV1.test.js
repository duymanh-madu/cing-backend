"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const route =
  fs.readFileSync(
    "routes/checkoutRoutes.js",
    "utf8"
  );

const service =
  fs.readFileSync(
    "services/commerce/pointsOnlyOperationalReadinessService.js",
    "utf8"
  );

const validation =
  fs.readFileSync(
    "services/checkoutValidationService.js",
    "utf8"
  );

const pointPolicy =
  fs.readFileSync(
    "services/commerce/canonicalPointRedemptionService.js",
    "utf8"
  );


test(
  "points-only readiness is operational not financial authority",
  () => {

    assert.match(
      service,
      /IPOS_POINTS_PAYMENT_METHOD/
    );

    assert.doesNotMatch(
      service,
      /subtotal|tier_discount|points_discount|point_value_vnd|total_points/
    );

    assert.doesNotMatch(
      service,
      /\.from\(["']players["']\)/
    );

    assert.doesNotMatch(
      service,
      /reservePaymentPoints|createPaymentSession|settlePointsOnly/
    );

  }
);


test(
  "missing approved points tender fails with bounded 503 readiness error",
  () => {

    assert.match(
      service,
      /COMMERCE_POINTS_ONLY_TENDER_NOT_READY/
    );

    assert.match(
      service,
      /statusCode:\s*503/
    );

  }
);


test(
  "checkout create preserves bounded operational HTTP status and error code",
  () => {
    const marker =
      route.indexOf(
        '"/create"'
      );

    assert.ok(
      marker >= 0
    );

    const catchStart =
      route.indexOf(
        "} catch (error) {",
        marker
      );

    assert.ok(
      catchStart > marker
    );

    const catchEnd =
      route.indexOf(
        "\n  }\n);",
        catchStart
      );

    assert.ok(
      catchEnd > catchStart
    );

    const catchRegion =
      route.slice(
        catchStart,
        catchEnd
      );

    assert.match(
      catchRegion,
      /Number\.isInteger\([\s\S]*error\?\.statusCode/
    );

    assert.match(
      catchRegion,
      /error\.statusCode >= 400/
    );

    assert.match(
      catchRegion,
      /error\.statusCode <= 599/
    );

    assert.match(
      catchRegion,
      /\? error\.statusCode[\s\S]*:\s*500/
    );

    assert.match(
      catchRegion,
      /if \(error\?\.code\)[\s\S]*responseBody\.code[\s\S]*error\.code/
    );

    assert.match(
      catchRegion,
      /\.status\([\s\S]*statusCode[\s\S]*\)[\s\S]*\.json\([\s\S]*responseBody/
    );

    assert.doesNotMatch(
      catchRegion,
      /res\.status\s*\(\s*500\s*\)/
    );
  }
);


test(
  "gate runs after canonical points-only derivation and before payment session",
  () => {

    const derive =
      route.indexOf(
        "const isPointsOnly ="
      );

    const gate =
      route.indexOf(
        "assertPointsOnlyCommerceReadiness();"
      );

    const payment =
      route.indexOf(
        "const paymentResult =",
        gate
      );

    assert.ok(
      derive >= 0
    );

    assert.ok(
      gate > derive
    );

    assert.ok(
      payment > gate
    );

  }
);


test(
  "only true points-only orders enter readiness gate",
  () => {

    assert.match(
      route,
      /if \(isPointsOnly\)[\s\S]*assertPointsOnlyCommerceReadiness\(\)/
    );

    assert.match(
      route,
      /const isPointsOnly =[\s\S]*remaining_payable[\s\S]*0[\s\S]*points_used[\s\S]*0/
    );

  }
);


test(
  "canonical money authority does not depend on iPOS tender config",
  () => {

    assert.doesNotMatch(
      validation,
      /IPOS_POINTS_PAYMENT_METHOD/
    );

    assert.doesNotMatch(
      pointPolicy,
      /IPOS_POINTS_PAYMENT_METHOD/
    );

    assert.doesNotMatch(
      validation,
      /COMMERCE_POINTS_ONLY_TENDER_NOT_READY/
    );

    assert.doesNotMatch(
      pointPolicy,
      /COMMERCE_POINTS_ONLY_TENDER_NOT_READY/
    );

  }
);
