"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const source =
  fs.readFileSync(
    "services/checkoutValidationService.js",
    "utf8"
  );


test(
  "client shipping and total consistency hints are optional",
  () => {

    assert.match(
      source,
      /submitted_shipping_fee\s*=\s*null/
    );

    assert.match(
      source,
      /submitted_total_amount\s*=\s*null/
    );

  }
);


test(
  "provided shipping hint is still checked against canonical shipping",
  () => {

    assert.match(
      source,
      /submitted_shipping_fee !== null[\s\S]*submitted_shipping_fee !== undefined[\s\S]*Number\([\s\S]*submitted_shipping_fee[\s\S]*shippingResult\.shipping_fee/
    );

    assert.match(
      source,
      /INVALID_SHIPPING_FEE/
    );

  }
);


test(
  "provided total hint is still checked against canonical total",
  () => {

    assert.match(
      source,
      /submitted_total_amount !== null[\s\S]*submitted_total_amount !== undefined[\s\S]*Number\([\s\S]*submitted_total_amount[\s\S]*expected_total_amount/
    );

    assert.match(
      source,
      /INVALID_TOTAL_AMOUNT/
    );

  }
);


test(
  "canonical total remains server-derived remaining payable",
  () => {

    assert.match(
      source,
      /const expected_total_amount\s*=\s*remaining_payable/
    );

  }
);


test(
  "client hints never become canonical financial values",
  () => {

    assert.doesNotMatch(
      source,
      /const\s+expected_total_amount\s*=\s*submitted_total_amount/
    );

    assert.doesNotMatch(
      source,
      /shipping_fee:\s*submitted_shipping_fee/
    );

  }
);
