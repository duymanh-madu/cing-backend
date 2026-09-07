"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const route =
  fs.readFileSync(
    "routes/shippingRoutes.js",
    "utf8"
  );

const shipping =
  fs.readFileSync(
    "services/shippingService.js",
    "utf8"
  );


function getCalculateRegion() {
  const start =
    route.indexOf(
      '"/calculate"'
    );

  const end =
    route.indexOf(
      "/**",
      start
    );

  assert.ok(
    start >= 0
  );

  assert.ok(
    end > start
  );

  return route.slice(
    start,
    end
  );
}


test(
  "legacy shipping calculate endpoint is terminal 410",
  () => {
    const region =
      getCalculateRegion();

    assert.match(
      region,
      /\.status\(\s*410\s*\)/
    );

    assert.match(
      region,
      /CANONICAL_SHIPPING_ENDPOINT_REQUIRED/
    );
  }
);


test(
  "retired calculate route owns zero executable pricing authority",
  () => {
    let region =
      getCalculateRegion();

    region =
      region.replace(
        /\/\*[\s\S]*?\*\//g,
        ""
      );

    region =
      region.replace(
        /\/\/[^\n]*/g,
        ""
      );

    assert.doesNotMatch(
      region,
      /\bsubtotal\b|\bdistanceKm\b/
    );

    assert.doesNotMatch(
      region,
      /shipping_tiers|shipping_fee_per_km|free_shipping_threshold/
    );

    assert.doesNotMatch(
      region,
      /calculateShippingFee\(/
    );

    assert.doesNotMatch(
      region,
      /\.from\(["']app_configs["']\)/
    );
  }
);


test(
  "shipping route has no legacy pricing helpers or direct Supabase pricing dependency",
  () => {
    assert.doesNotMatch(
      route,
      /function calcShipFeeFromTiers/
    );

    assert.doesNotMatch(
      route,
      /function calcDistKm/
    );

    assert.doesNotMatch(
      route,
      /const\s+supabase\s*=\s*require\(\s*["']\.\.\/supabase["']/
    );
  }
);


test(
  "estimate delegates to canonical shipping service",
  () => {
    assert.match(
      route,
      /router\.get\(\s*["']\/estimate["'][\s\S]*calculateShippingFee\(/
    );

    assert.match(
      shipping,
      /async function calculateShippingFee/
    );
  }
);
