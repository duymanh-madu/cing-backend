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
  "active typed-address runtime has zero Google Geocoding API dependency",
  () => {
    const typed =
      read(
        "services/typedDeliveryAddressResolutionService.js"
      );

    assert.doesNotMatch(
      typed,
      /geocodeDeliveryAddress/
    );

    assert.doesNotMatch(
      typed,
      /shippingAddressGeocodingService/
    );

    assert.doesNotMatch(
      typed,
      /GOOGLE_MAPS_GEOCODING_API_KEY/
    );

    assert.match(
      typed,
      /resolveDrivingRouteFromAddress/
    );
  }
);


test(
  "active Routes provider owns typed-address provider credential",
  () => {
    const routes =
      read(
        "services/shippingRoadRouteService.js"
      );

    assert.match(
      routes,
      /GOOGLE_MAPS_ROUTES_API_KEY/
    );

    assert.doesNotMatch(
      routes,
      /GOOGLE_MAPS_GEOCODING_API_KEY/
    );
  }
);
