"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const routeSource =
  fs.readFileSync(
    "routes/checkoutRoutes.js",
    "utf8"
  );

const pointSource =
  fs.readFileSync(
    "services/commerce/canonicalPointRedemptionService.js",
    "utf8"
  );


function routeRegion(
  routeName
) {

  const pattern =
    new RegExp(
      `router\\.post\\(\\s*["']/${routeName}["']`
    );

  const start =
    routeSource.search(
      pattern
    );

  assert.ok(
    start >= 0,
    routeName
  );


  const remainder =
    routeSource.slice(
      start + 1
    );

  const next =
    remainder.match(
      /\nrouter\.(?:get|post|put|delete|patch)\(/
    );


  const end =
    next
      ? start +
        1 +
        next.index
      : routeSource.length;


  return routeSource.slice(
    start,
    end
  );

}


test(
  "obsolete checkout validate endpoint is authenticated",
  () => {

    const route =
      routeRegion(
        "validate"
      );

    assert.match(
      route,
      /authMiddleware/
    );

  }
);


test(
  "obsolete checkout validate endpoint is terminal 410",
  () => {

    const route =
      routeRegion(
        "validate"
      );

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
  "obsolete checkout validate endpoint performs no canonical pricing work",
  () => {

    const route =
      routeRegion(
        "validate"
      );

    assert.doesNotMatch(
      route,
      /validateCheckout\(/
    );

    assert.doesNotMatch(
      route,
      /req\.body/
    );

    assert.doesNotMatch(
      route,
      /resolveCanonicalPointRedemption/
    );

    assert.doesNotMatch(
      route,
      /createPaymentSession/
    );

    assert.doesNotMatch(
      route,
      /\.insert\(/
    );

    assert.doesNotMatch(
      route,
      /\.update\(/
    );

  }
);


test(
  "canonical checkout create remains authenticated and user bound",
  () => {

    const route =
      routeRegion(
        "create"
      );

    assert.match(
      route,
      /authMiddleware/
    );

    assert.match(
      route,
      /canonicalUserId/
    );

    assert.match(
      route,
      /user_id:/
    );

    assert.match(
      route,
      /points_requested/
    );

    assert.match(
      route,
      /await validateCheckout\(\{/
    );

    assert.match(
      route,
      /await createPaymentSession\(\{/
    );

  }
);


test(
  "point resolver remains strict user-bound authority",
  () => {

    assert.match(
      pointSource,
      /COMMERCE_POINTS_USER_REQUIRED/
    );

    assert.match(
      pointSource,
      /\.from\("players"\)/
    );

    assert.match(
      pointSource,
      /total_points/
    );

    assert.match(
      pointSource,
      /getCanonicalPointBalance\(\s*userId\s*\)/
    );

  }
);
