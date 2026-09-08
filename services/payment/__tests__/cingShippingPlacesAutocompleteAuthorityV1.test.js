"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const autocomplete =
  fs.readFileSync(
    "services/googlePlacesDeliveryAutocompleteService.js",
    "utf8"
  );

const routes =
  fs.readFileSync(
    "services/shippingRoadRouteService.js",
    "utf8"
  );

const selected =
  fs.readFileSync(
    "services/selectedDeliveryPlaceResolutionService.js",
    "utf8"
  );

const shippingRoutes =
  fs.readFileSync(
    "routes/shippingRoutes.js",
    "utf8"
  );


test(
  "Places Autocomplete runs only through backend-owned credential",
  () => {
    assert.match(
      autocomplete,
      /GOOGLE_MAPS_PLACES_API_KEY/
    );

    assert.match(
      autocomplete,
      /places\.googleapis\.com\/v1\/places:autocomplete/
    );

    assert.match(
      autocomplete,
      /X-Goog-Api-Key/
    );

    assert.match(
      shippingRoutes,
      /"\/address-suggestions"[\s\S]*authMiddleware/
    );
  }
);


test(
  "autocomplete is Vietnam-scoped and session-bound",
  () => {
    assert.match(
      autocomplete,
      /sessionToken/
    );

    assert.match(
      autocomplete,
      /languageCode:[\s\S]*"vi"/
    );

    assert.match(
      autocomplete,
      /regionCode:[\s\S]*"VN"/
    );

    assert.match(
      autocomplete,
      /includedRegionCodes:[\s\S]*\["vn"\]/
    );

    assert.match(
      autocomplete,
      /slice\([\s\S]*0,[\s\S]*5/
    );
  }
);


test(
  "selected place uses Routes placeId directly",
  () => {
    assert.match(
      routes,
      /resolveDrivingRouteFromPlaceId/
    );

    assert.match(
      routes,
      /destination:[\s\S]*placeId/
    );

    assert.match(
      routes,
      /travelMode:[\s\S]*"DRIVE"/
    );

    assert.match(
      routes,
      /routes\.legs\.endLocation/
    );

    assert.match(
      selected,
      /resolveDrivingRouteFromPlaceId/
    );
  }
);


test(
  "selected place never trusts frontend destination coordinates",
  () => {
    assert.doesNotMatch(
      selected,
      /destination_latitude\s*,/
    );

    assert.doesNotMatch(
      selected,
      /destination_longitude\s*,/
    );

    assert.match(
      selected,
      /destinationLat[\s\S]*route\.latitude/
    );

    assert.match(
      selected,
      /destinationLng[\s\S]*route\.longitude/
    );
  }
);


test(
  "road distance remains canonical shipping authority",
  () => {
    assert.match(
      selected,
      /calculateShippingFee/
    );

    assert.match(
      selected,
      /route_snapshot:[\s\S]*distance_meters:[\s\S]*route\.distance_meters/
    );

    assert.match(
      selected,
      /createDeliveryLocationCandidate/
    );

    assert.match(
      selected,
      /place_id:[\s\S]*placeId/
    );

    assert.match(
      selected,
      /route_distance_meters/
    );
  }
);


test(
  "raw typed-address fallback remains intact",
  () => {
    assert.match(
      shippingRoutes,
      /"\/resolve-address"/
    );

    assert.match(
      shippingRoutes,
      /resolveTypedDeliveryAddress/
    );
  }
);


test(
  "Places absence fails closed instead of widening Routes credential",
  () => {
    assert.match(
      autocomplete,
      /DELIVERY_PLACES_NOT_CONFIGURED/
    );

    assert.doesNotMatch(
      autocomplete,
      /GOOGLE_MAPS_ROUTES_API_KEY/
    );
  }
);


test(
  "selected place terminates autocomplete with minimal Place Details Essentials",
  () => {
    assert.match(
      autocomplete,
      /getSelectedDeliveryPlaceDetails/
    );

    assert.match(
      autocomplete,
      /PLACES_DETAILS_FIELD_MASK[\s\S]*id,name,formattedAddress/
    );

    assert.match(
      autocomplete,
      /sessionToken/
    );

    assert.match(
      selected,
      /getSelectedDeliveryPlaceDetails/
    );

    assert.match(
      shippingRoutes,
      /"\/resolve-place"[\s\S]*session_token/
    );
  }
);


test(
  "frontend address text never becomes signed selected-place authority",
  () => {
    assert.doesNotMatch(
      selected,
      /formatted_address,\s*\n\s*current_latitude/
    );

    assert.match(
      selected,
      /canonicalAddress[\s\S]*placeDetails\.formatted_address/
    );

    assert.match(
      selected,
      /formatted_address:[\s\S]*canonicalAddress/
    );

    assert.match(
      selected,
      /address_text:[\s\S]*canonicalAddress/
    );
  }
);


test(
  "selected-place GPS mismatch remains sanity-only and uses Routes endpoint",
  () => {
    assert.match(
      selected,
      /calculateDistance/
    );

    assert.match(
      selected,
      /destination_latitude:[\s\S]*destinationLat/
    );

    assert.match(
      selected,
      /destination_longitude:[\s\S]*destinationLng/
    );

    assert.doesNotMatch(
      selected,
      /mismatchDistanceKm\s*=\s*0/
    );
  }
);


test(
  "Place Details may canonicalize autocomplete alias without weakening authority",
  () => {
    assert.match(
      autocomplete,
      /id,name,formattedAddress/
    );

    assert.doesNotMatch(
      autocomplete,
      /returnedPlaceId\s*!==\s*placeId[\s\S]*DELIVERY_PLACE_DETAILS_ID_MISMATCH/
    );

    assert.match(
      autocomplete,
      /resourceName\s*!==[\s\S]*`places\/\$\{returnedPlaceId\}`/
    );

    assert.match(
      autocomplete,
      /canonicalized:[\s\S]*returnedPlaceId\s*!==[\s\S]*placeId/
    );
  }
);


test(
  "canonical Place Details id becomes Routes and candidate authority",
  () => {
    assert.match(
      selected,
      /canonicalPlaceId\s*=[\s\S]*placeDetails\.place_id/
    );

    assert.match(
      selected,
      /destination_place_id:[\s\S]*canonicalPlaceId/
    );

    assert.match(
      selected,
      /place_id:[\s\S]*canonicalPlaceId/
    );
  }
);
