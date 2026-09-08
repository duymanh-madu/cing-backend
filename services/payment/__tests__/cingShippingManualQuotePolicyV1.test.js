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

const shipping =
  read(
    "services/shippingService.js"
  );

const routes =
  read(
    "services/shippingRoadRouteService.js"
  );

const typed =
  read(
    "services/typedDeliveryAddressResolutionService.js"
  );

const validation =
  read(
    "services/checkoutValidationService.js"
  );

const checkout =
  read(
    "routes/checkoutRoutes.js"
  );


test(
  "distance beyond automatic radius remains orderable",
  () => {
    assert.match(
      shipping,
      /distance_km\s*>\s*maxDistance[\s\S]*success:\s*true/
    );

    assert.doesNotMatch(
      shipping,
      /distance_km\s*>\s*maxDistance[\s\S]{0,300}success:\s*false/
    );

    assert.match(
      shipping,
      /manual_shipping_quote_required:[\s\S]*true/
    );

    assert.match(
      shipping,
      /free_shipping:\s*false/
    );
  }
);


test(
  "manual shipping fee is not represented as free shipping",
  () => {
    assert.match(
      shipping,
      /shipping_fee:\s*0[\s\S]*free_shipping:\s*false[\s\S]*manual_shipping_quote_required/
    );

    assert.match(
      shipping,
      /Cửa hàng sẽ liên hệ lại để thống nhất đơn giá ship/
    );
  }
);


test(
  "partial Google address match is advisory rather than blocking",
  () => {
    assert.match(
      routes,
      /const partialMatch\s*=[\s\S]*partialMatch === true/
    );

    assert.doesNotMatch(
      routes,
      /if\s*\(\s*partialMatch\s*\)[\s\S]{0,250}throw routeError/
    );

    assert.match(
      routes,
      /partial_match:[\s\S]*partialMatch/
    );

    assert.match(
      routes,
      /DELIVERY_ADDRESS_PLACE_ID_REQUIRED/
    );

    assert.match(
      routes,
      /DELIVERY_ADDRESS_TOO_COARSE/
    );
  }
);


test(
  "typed address exposes road quote and partial-match metadata",
  () => {
    assert.match(
      typed,
      /manual_shipping_quote_required/
    );

    assert.match(
      typed,
      /shipping_quote_note/
    );

    assert.match(
      typed,
      /address_match_partial/
    );

    assert.match(
      typed,
      /shipping_distance_km:[\s\S]*shipping\.distance_km/
    );
  }
);


test(
  "checkout validation preserves manual shipping authority",
  () => {
    assert.match(
      validation,
      /manual_shipping_quote_required/
    );

    assert.match(
      validation,
      /shipping_quote_note/
    );
  }
);


test(
  "backend freezes mandatory manual-shipping note into payment snapshot",
  () => {
    assert.match(
      checkout,
      /note:[\s\S]*req\.body\?\.note[\s\S]*manual_shipping_quote_required/
    );

    assert.match(
      checkout,
      /Cửa hàng sẽ liên hệ lại để thống nhất đơn giá ship/
    );

    assert.match(
      checkout,
      /manual_shipping_quote_required:[\s\S]*validationResult/
    );
  }
);
