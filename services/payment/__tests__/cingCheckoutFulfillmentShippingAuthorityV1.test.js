"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const checkoutValidation =
  fs.readFileSync(
    "services/checkoutValidationService.js",
    "utf8"
  );

const checkoutRoutes =
  fs.readFileSync(
    "routes/checkoutRoutes.js",
    "utf8"
  );

const shippingService =
  fs.readFileSync(
    "services/shippingService.js",
    "utf8"
  );

const shippingRoutes =
  fs.readFileSync(
    "routes/shippingRoutes.js",
    "utf8"
  );

test(
  "checkout receives canonical fulfillment type",
  () => {
    assert.match(
      checkoutRoutes,
      /canonicalOrderType[\s\S]*validateCheckout\([\s\S]*order_type:\s*canonicalOrderType/
    );
  }
);

test(
  "non-delivery fulfillment has zero shipping without coordinates",
  () => {
    assert.match(
      checkoutValidation,
      /requiresDelivery[\s\S]*normalizedOrderType[\s\S]*"delivery"/
    );

    assert.match(
      checkoutValidation,
      /requiresDelivery[\s\S]*calculateShippingFee[\s\S]*shipping_fee:\s*0[\s\S]*distance_km:\s*null/
    );
  }
);

test(
  "canonical shipping reads app_configs only",
  () => {
    assert.match(
      shippingService,
      /\.from\("app_configs"\)/
    );

    assert.doesNotMatch(
      shippingService,
      /\.from\("shipping_configs"\)/
    );
  }
);

test(
  "tier matching includes distance and order amount",
  () => {
    for (const rx of [
      /distance_km >= minKm/,
      /distance_km <= maxKm/,
      /total_amount >= minOrder/,
      /total_amount <= maxOrder/,
    ]) {
      assert.match(
        shippingService,
        rx
      );
    }
  }
);

test(
  "estimate route reuses canonical shipping service",
  () => {
    const start =
      shippingRoutes.indexOf(
        'router.get("/estimate"'
      );

    const end =
      shippingRoutes.indexOf(
        "/**",
        start + 20
      );

    const block =
      shippingRoutes.slice(
        start,
        end
      );

    assert.match(
      block,
      /calculateShippingFee\(\{/
    );

    assert.doesNotMatch(
      block,
      /getEstimateShipFee\(\{/
    );
  }
);

test(
  "legacy 15000 base fee is removed from canonical shipping service",
  () => {
    assert.doesNotMatch(
      shippingService,
      /base_fee:\s*15000/
    );
  }
);

test(
  "missing delivery coordinates fail closed instead of becoming zero coordinates",
  () => {
    assert.match(
      shippingService,
      /destination_latitude !== null[\s\S]*destination_latitude !== undefined/
    );

    assert.match(
      shippingService,
      /String\(destination_latitude\)\.trim\(\) !== ""/
    );

    assert.match(
      shippingService,
      /destination_longitude !== null[\s\S]*destination_longitude !== undefined/
    );

    assert.match(
      shippingService,
      /destinationLat < -90[\s\S]*destinationLat > 90/
    );

    assert.match(
      shippingService,
      /destinationLng < -180[\s\S]*destinationLng > 180/
    );
  }
);
