"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

const geocoder =
  read(
    "services/shippingAddressGeocodingService.js"
  );

const candidate =
  read(
    "services/deliveryLocationCandidateService.js"
  );

const resolver =
  read(
    "services/typedDeliveryAddressResolutionService.js"
  );

const shippingRoutes =
  read(
    "routes/shippingRoutes.js"
  );

const locationAuthority =
  read(
    "services/deliveryLocationAuthorityService.js"
  );

test(
  "typed-address geocoding stays backend-owned",
  () => {
    assert.match(
      geocoder,
      /GOOGLE_MAPS_GEOCODING_API_KEY/
    );

    assert.match(
      geocoder,
      /X-Goog-Api-Key/
    );
  }
);

test(
  "candidate is signed and expires",
  () => {
    assert.match(
      candidate,
      /createHmac/
    );

    assert.match(
      candidate,
      /SHIPPING_LOCATION_TOKEN_SECRET/
    );

    assert.match(
      candidate,
      /timingSafeEqual/
    );

    assert.match(
      candidate,
      /15 \* 60/
    );
  }
);

test(
  "GPS versus typed address mismatch threshold is 200m",
  () => {
    assert.match(
      resolver,
      /MISMATCH_THRESHOLD_KM\s*=\s*0\.2/
    );

    assert.match(
      resolver,
      /mismatchDistanceKm\s*>\s*MISMATCH_THRESHOLD_KM/
    );
  }
);

test(
  "candidate shipping fee is calculated by canonical backend service",
  () => {
    assert.match(
      resolver,
      /calculateShippingFee\(\{/
    );

    assert.match(
      resolver,
      /destination_latitude:[\s\S]*geocoded\.latitude/
    );

    assert.match(
      resolver,
      /destination_longitude:[\s\S]*geocoded\.longitude/
    );
  }
);

test(
  "resolve-address exposes backend-issued candidate token",
  () => {
    assert.match(
      shippingRoutes,
      /"\/resolve-address"/
    );

    assert.match(
      shippingRoutes,
      /resolveTypedDeliveryAddress/
    );

    assert.doesNotMatch(
      shippingRoutes,
      /candidate_token\s*:\s*req\.body/
    );
  }
);

test(
  "typed-address candidate is a recognized final location source",
  () => {
    assert.match(
      locationAuthority,
      /typed_address_geocode/
    );
  }
);
