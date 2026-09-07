"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const {
  pricePointRedemption,
} = require(
  "../../commerce/canonicalPointRedemptionService"
);


test(
  "one point receives its full configured value",
  () => {

    const result =
      pricePointRedemption({
        requestedPoints:
          7,
        availablePoints:
          100,
        prePointsPayable:
          20000,
        pointValueVnd:
          1000,
      });

    assert.equal(
      result.points_used,
      7
    );

    assert.equal(
      result.points_discount,
      7000
    );

    assert.equal(
      result.remaining_payable,
      13000
    );

  }
);


test(
  "point maximum uses floor and never over-discounts payable",
  () => {

    const result =
      pricePointRedemption({
        requestedPoints:
          36,
        availablePoints:
          100,
        prePointsPayable:
          36100,
        pointValueVnd:
          1000,
      });

    assert.equal(
      result.max_points_by_payable,
      36
    );

    assert.equal(
      result.points_discount,
      36000
    );

    assert.equal(
      result.remaining_payable,
      100
    );

  }
);


test(
  "ceil-style over-redemption fails closed",
  () => {

    assert.throws(
      () =>
        pricePointRedemption({
          requestedPoints:
            37,
          availablePoints:
            100,
          prePointsPayable:
            36100,
          pointValueVnd:
            1000,
        }),
      error =>
        error.code ===
          "COMMERCE_POINTS_EXCEEDS_PAYABLE"
    );

  }
);


test(
  "request beyond balance fails instead of silently charging more cash",
  () => {

    assert.throws(
      () =>
        pricePointRedemption({
          requestedPoints:
            11,
          availablePoints:
            10,
          prePointsPayable:
            50000,
          pointValueVnd:
            1000,
        }),
      error =>
        error.code ===
          "COMMERCE_POINTS_INSUFFICIENT_BALANCE"
    );

  }
);


test(
  "zero-point order is valid and unchanged",
  () => {

    const result =
      pricePointRedemption({
        requestedPoints:
          0,
        availablePoints:
          50,
        prePointsPayable:
          12345,
        pointValueVnd:
          1000,
      });

    assert.equal(
      result.points_used,
      0
    );

    assert.equal(
      result.points_discount,
      0
    );

    assert.equal(
      result.remaining_payable,
      12345
    );

  }
);


test(
  "exact full point coverage may produce zero remaining payable",
  () => {

    const result =
      pricePointRedemption({
        requestedPoints:
          36,
        availablePoints:
          100,
        prePointsPayable:
          36000,
        pointValueVnd:
          1000,
      });

    assert.equal(
      result.points_discount,
      36000
    );

    assert.equal(
      result.remaining_payable,
      0
    );

  }
);


test(
  "fractional negative and unsafe point requests fail",
  () => {

    for (
      const requestedPoints
      of [
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
      ]
    ) {

      assert.throws(
        () =>
          pricePointRedemption({
            requestedPoints,
            availablePoints:
              100,
            prePointsPayable:
              50000,
            pointValueVnd:
              1000,
          })
      );

    }

  }
);


test(
  "maximum usable points is bounded by both balance and payable",
  () => {

    const result =
      pricePointRedemption({
        requestedPoints:
          5,
        availablePoints:
          8,
        prePointsPayable:
          20000,
        pointValueVnd:
          1000,
      });

    assert.equal(
      result.maximum_usable_points,
      8
    );

  }
);


test(
  "production resolver reads policy and player balance server-side",
  () => {

    const source =
      fs.readFileSync(
        "services/commerce/canonicalPointRedemptionService.js",
        "utf8"
      );

    assert.match(
      source,
      /\.from\("app_configs"\)/
    );

    assert.match(
      source,
      /loyalty_point_value_vnd/
    );

    assert.match(
      source,
      /\.from\("players"\)/
    );

    assert.match(
      source,
      /total_points/
    );

  }
);
