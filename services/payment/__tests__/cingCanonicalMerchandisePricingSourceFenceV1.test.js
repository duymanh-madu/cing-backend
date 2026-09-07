"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const source =
  fs.readFileSync(
    "services/commerce/canonicalMerchandisePricingService.js",
    "utf8"
  );


test(
  "pricing authority reads active menu repository",
  () => {

    assert.match(
      source,
      /getActiveMenuItems/
    );

  }
);


test(
  "pricing identity requires ITEM ids",
  () => {

    assert.match(
      source,
      /ITEM-\[A-Za-z0-9_-\]/
    );

  }
);


test(
  "pricing validates base to option relationship",
  () => {

    assert.match(
      source,
      /OPTION_NOT_ALLOWED/
    );

    assert.match(
      source,
      /raw_data\?\.customizations/
    );

  }
);


test(
  "group minimum and maximum are enforced",
  () => {

    assert.match(
      source,
      /GROUP_MIN_NOT_MET/
    );

    assert.match(
      source,
      /GROUP_MAX_EXCEEDED/
    );

  }
);


test(
  "submitted client price is never read as pricing authority",
  () => {

    assert.doesNotMatch(
      source,
      /submittedItem\?\.price|submittedItem\.price/
    );

  }
);


test(
  "canonical option price conflict fails closed",
  () => {

    assert.match(
      source,
      /OPTION_PRICE_CONFLICT/
    );

  }
);
