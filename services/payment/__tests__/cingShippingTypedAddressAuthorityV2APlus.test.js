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

const typed =
  read(
    "services/typedDeliveryAddressResolutionService.js"
  );

const routes =
  read(
    "services/shippingRoadRouteService.js"
  );

const shippingRoutes =
  read(
    "routes/shippingRoutes.js"
  );

const finalDestination =
  read(
    "services/finalDeliveryDestinationAuthorityService.js"
  );


test(
  "typed-address resolution uses Routes address waypoint only",
  () => {
    assert.match(
      typed,
      /resolveDrivingRouteFromAddress/
    );

    assert.doesNotMatch(
      typed,
      /geocodeDeliveryAddress/
    );

    assert.doesNotMatch(
      typed,
      /shippingAddressGeocodingService/
    );

    assert.match(
      routes,
      /destination:[\s\S]*address/
    );

    assert.match(
      routes,
      /geocodingResults/
    );
  }
);


test(
  "Routes address authority treats partial match as advisory while rejecting unusable destinations",
  () => {
    assert.match(
      routes,
      /geocoded\?\.partialMatch\s*===\s*true/
    );

    assert.match(
      routes,
      /partial_match:[\s\S]*partialMatch/
    );

    assert.doesNotMatch(
      routes,
      /DELIVERY_ADDRESS_PARTIAL_MATCH/
    );

    assert.doesNotMatch(
      routes,
      /if\s*\(\s*partialMatch\s*\)[\s\S]{0,250}throw routeError/
    );

    assert.match(
      routes,
      /DELIVERY_ADDRESS_PLACE_ID_REQUIRED/
    );

    assert.match(
      routes,
      /DELIVERY_CAPABLE_TYPES/
    );

    assert.match(
      routes,
      /DELIVERY_ADDRESS_TOO_COARSE/
    );

    assert.match(
      routes,
      /DELIVERY_ADDRESS_ROUTE_ENDPOINT_INVALID/
    );
  }
);


test(
  "provider route endpoint becomes canonical delivery candidate",
  () => {
    assert.match(
      routes,
      /legs\?\.\[0\][\s\S]*endLocation[\s\S]*latLng/
    );

    assert.match(
      typed,
      /candidate_latitude:[\s\S]*routeAddress\.latitude/
    );

    assert.match(
      typed,
      /candidate_longitude:[\s\S]*routeAddress\.longitude/
    );

    assert.match(
      typed,
      /place_id:[\s\S]*routeAddress\.place_id/
    );
  }
);


test(
  "GPS versus typed address mismatch remains 200m sanity-only",
  () => {
    assert.match(
      typed,
      /MISMATCH_THRESHOLD_KM\s*=\s*0\.2/
    );

    assert.match(
      typed,
      /mismatchDistanceKm\s*=\s*calculateDistance\(/
    );

    assert.match(
      typed,
      /routeAddress\.latitude/
    );

    assert.match(
      typed,
      /routeAddress\.longitude/
    );
  }
);


test(
  "typed address issues exactly one provider route call",
  () => {
    const calls =
      typed.match(
        /resolveDrivingRouteFromAddress\s*\(\{/g
      ) || [];

    assert.equal(
      calls.length,
      1
    );
  }
);


test(
  "typed address reuses provider road snapshot for canonical shipping",
  () => {
    assert.match(
      typed,
      /calculateShippingFee\(\{[\s\S]*route_snapshot:/
    );

    assert.match(
      typed,
      /distance_meters:[\s\S]*routeAddress[\s\S]*distance_meters/
    );

    assert.match(
      typed,
      /duration_seconds:[\s\S]*routeAddress[\s\S]*duration_seconds/
    );

    assert.match(
      typed,
      /route_distance_meters:[\s\S]*shipping/
    );
  }
);


test(
  "store route origin remains backend app_configs authority",
  () => {
    assert.match(
      typed,
      /getShippingConfig\(\)/
    );

    assert.match(
      typed,
      /shippingConfig[\s\S]*store_latitude/
    );

    assert.match(
      typed,
      /shippingConfig[\s\S]*store_longitude/
    );
  }
);


test(
  "resolve-address remains authenticated and user-bound",
  () => {
    assert.match(
      shippingRoutes,
      /["']\/resolve-address["'][\s\S]*authMiddleware/
    );

    assert.match(
      shippingRoutes,
      /canonicalUserId[\s\S]*req\.customer\?\.phone/
    );

    assert.match(
      shippingRoutes,
      /user_id:[\s\S]*canonicalUserId/
    );

    assert.doesNotMatch(
      shippingRoutes,
      /user_id:\s*req\.body/
    );
  }
);


test(
  "typed-address compatibility source remains recognized",
  () => {
    assert.match(
      finalDestination,
      /typed_address_geocode/
    );
  }
);
