"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const source =
  fs.readFileSync(
    "db/migrations/20260907_commerce_point_redemption_policy_v1.sql",
    "utf8"
  );

const packaged =
  fs.readFileSync(
    "supabase/migrations/20260907064500_commerce_point_redemption_policy_v1.sql",
    "utf8"
  );


test(
  "source and packaged migrations are identical",
  () => {

    assert.equal(
      source,
      packaged
    );

  }
);


test(
  "point value becomes DB configuration authority",
  () => {

    assert.match(
      source,
      /loyalty_point_value_vnd integer/i
    );

    assert.match(
      source,
      /set loyalty_point_value_vnd = 1000/i
    );

    assert.match(
      source,
      /set not null/i
    );

  }
);


test(
  "point value must remain a positive bounded integer",
  () => {

    assert.match(
      source,
      /loyalty_point_value_vnd >= 1/i
    );

    assert.match(
      source,
      /loyalty_point_value_vnd <= 1000000/i
    );

  }
);
