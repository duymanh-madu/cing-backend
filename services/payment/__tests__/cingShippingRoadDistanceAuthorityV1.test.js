"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

function read(path) {
  return fs.readFileSync(
    path,
    "utf8"
  );
}

test(
  "shipping money authority resolves Google Routes driving distance",
  () => {
    const source =
      read(
        "services/shippingService.js"
      );

    assert.match(
      source,
      /resolveDrivingRoute/
    );

    assert.match(
      source,
      /route\.distance_km/
    );

    assert.doesNotMatch(
      source,
      /const distance_km\s*=\s*calculateDistance\(/
    );

    assert.doesNotMatch(
      source,
      /distance_km\s*\*\s*3/
    );
  }
);

test(
  "Haversine remains available only for non-money GPS mismatch use",
  () => {
    const shipping =
      read(
        "services/shippingService.js"
      );

    const typed =
      read(
        "services/typedDeliveryAddressResolutionService.js"
      );

    assert.match(
      shipping,
      /function calculateDistance/
    );

    assert.match(
      typed,
      /mismatchDistanceKm\s*=\s*calculateDistance\(/
    );
  }
);

test(
  "typed address signs canonical road route snapshot",
  () => {
    const typed =
      read(
        "services/typedDeliveryAddressResolutionService.js"
      );

    const candidate =
      read(
        "services/deliveryLocationCandidateService.js"
      );

    assert.match(
      typed,
      /route_distance_meters:[\s\S]*shipping[\s\S]*route_distance_meters/
    );

    assert.match(
      typed,
      /route_duration_seconds:[\s\S]*shipping[\s\S]*route_duration_seconds/
    );

    assert.match(
      candidate,
      /route_distance_meters/
    );

    assert.match(
      candidate,
      /route_duration_seconds/
    );
  }
);

test(
  "checkout uses verified signed route snapshot instead of trusting signed fee",
  () => {
    const destination =
      read(
        "services/finalDeliveryDestinationAuthorityService.js"
      );

    const route =
      read(
        "routes/checkoutRoutes.js"
      );

    const validation =
      read(
        "services/checkoutValidationService.js"
      );

    assert.match(
      destination,
      /candidateAuthority[\s\S]*route_snapshot/
    );

    assert.match(
      route,
      /shipping_route_snapshot:[\s\S]*candidate_authority[\s\S]*route_snapshot/
    );

    assert.match(
      validation,
      /shipping_route_snapshot\s*=\s*null/
    );

    assert.match(
      validation,
      /route_snapshot:[\s\S]*shipping_route_snapshot/
    );
  }
);

test(
  "Routes provider is DRIVE, fail-closed, and requests minimal authority fields",
  () => {
    const source =
      read(
        "services/shippingRoadRouteService.js"
      );

    assert.match(
      source,
      /travelMode:[\s\S]*"DRIVE"/
    );

    assert.match(
      source,
      /routingPreference:[\s\S]*"TRAFFIC_UNAWARE"/
    );

    assert.match(
      source,
      /routes\.distanceMeters,routes\.duration/
    );

    assert.match(
      source,
      /DELIVERY_ROUTES_PROVIDER_FAILED/
    );

    assert.match(
      source,
      /DELIVERY_ROUTES_NO_ROUTE/
    );

    assert.doesNotMatch(
      source,
      /calculateDistance/
    );
  }
);

test(
  "legacy candidate without road snapshot cannot become zero-distance authority",
  () => {
    const source =
      read(
        "services/finalDeliveryDestinationAuthorityService.js"
      );

    assert.match(
      source,
      /route_distance_meters\s*!==[\s\S]*null/
    );

    assert.match(
      source,
      /route_distance_meters\s*!==[\s\S]*undefined/
    );

    assert.match(
      source,
      /route_duration_seconds\s*!==[\s\S]*null/
    );

    assert.match(
      source,
      /route_duration_seconds\s*!==[\s\S]*undefined/
    );

    assert.match(
      source,
      /hasSignedRouteSnapshot\s*=[\s\S]*hasRouteDistance[\s\S]*hasRouteDuration/
    );
  }
);

test(
  "route snapshot is an explicit shipping money-authority input",
  () => {
    const source =
      read(
        "services/shippingService.js"
      );

    assert.match(
      source,
      /async function calculateShippingFee\(\{[\s\S]*route_snapshot\s*=\s*null/
    );

    assert.doesNotMatch(
      source,
      /arguments\[0\]/
    );
  }
);

test(
  "paid shipping estimate surface is authenticated",
  () => {
    const source =
      read(
        "routes/shippingRoutes.js"
      );

    assert.match(
      source,
      /router\.get\([\s\S]*["']\/estimate["'][\s\S]*authMiddleware/
    );
  }
);
