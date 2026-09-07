"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


function read(
  file
) {
  return fs.readFileSync(
    file,
    "utf8"
  );
}


function routeRegion(
  text,
  startNeedle,
  nextNeedle
) {
  const start =
    text.indexOf(
      startNeedle
    );

  assert.ok(
    start >= 0,
    `missing route ${startNeedle}`
  );

  const end =
    nextNeedle
      ? text.indexOf(
          nextNeedle,
          start + 1
        )
      : text.length;

  assert.ok(
    end > start
  );

  return text.slice(
    start,
    end
  );
}


const adminOrder =
  read(
    "routes/adminOrderRoutes.js"
  );

const adminDelivery =
  read(
    "routes/adminDeliveryRoutes.js"
  );

const shipper =
  read(
    "routes/shipperPortalRoutes.js"
  );


const durableFields = [
  "shipping_address",
  "delivery_latitude",
  "delivery_longitude",
  "delivery_address_detail",
  "delivery_location_source",
];


test(
  "admin order list projects canonical durable destination",
  () => {
    const region =
      routeRegion(
        adminOrder,
        'router.get("/list"',
        'router.get("/stats"'
      );

    for (
      const field
      of durableFields
    ) {
      assert.match(
        region,
        new RegExp(
          `\\b${field}\\b`
        )
      );
    }
  }
);


test(
  "admin order detail already returns full durable order row",
  () => {
    const region =
      routeRegion(
        adminOrder,
        'router.get("/detail/:id"',
        'router.put("/status/:id"'
      );

    assert.match(
      region,
      /\.select\(\s*["']\*["']\s*\)/
    );
  }
);


test(
  "admin delivery list enriched order projection exposes durable destination",
  () => {
    const region =
      routeRegion(
        adminDelivery,
        'router.get("/list"',
        'router.get("/stats"'
      );

    for (
      const field
      of durableFields
    ) {
      assert.match(
        region,
        new RegExp(
          `\\b${field}\\b`
        )
      );
    }

    assert.match(
      region,
      /orders:\s*orderMap\[r\.order_id\]/
    );
  }
);


test(
  "admin orders-ready exposes durable canonical destination",
  () => {
    const region =
      routeRegion(
        adminDelivery,
        'router.get("/orders-ready"',
        'router.get("/fulfillment-orders"'
      );

    for (
      const field
      of durableFields
    ) {
      assert.match(
        region,
        new RegExp(
          `\\b${field}\\b`
        )
      );
    }

    assert.match(
      region,
      /\.eq\(\s*["']order_type["']\s*,\s*["']delivery["']\s*\)/
    );
  }
);


test(
  "pickup and dine-in fulfillment surface is not delivery destination authority",
  () => {
    const region =
      routeRegion(
        adminDelivery,
        'router.get("/fulfillment-orders"',
        "module.exports"
      );

    assert.match(
      region,
      /\["pickup",\s*"dine_in"\]/
    );

    assert.doesNotMatch(
      region,
      /\.eq\(\s*["']order_type["']\s*,\s*["']delivery["']\s*\)/
    );
  }
);


test(
  "shipper order detail receives durable canonical destination",
  () => {
    const region =
      routeRegion(
        shipper,
        'router.get("/order/:token"',
        'router.post("/status/:token"'
      );

    for (
      const field
      of durableFields
    ) {
      assert.match(
        region,
        new RegExp(
          `\\b${field}\\b`
        )
      );
    }

    assert.match(
      region,
      /data:\s*\{\s*tracking,\s*order\s*\}/
    );
  }
);


test(
  "read projection patch does not create delivery mutation authority",
  () => {
    const regions = [
      routeRegion(
        adminOrder,
        'router.get("/list"',
        'router.get("/stats"'
      ),

      routeRegion(
        adminDelivery,
        'router.get("/list"',
        'router.get("/stats"'
      ),

      routeRegion(
        adminDelivery,
        'router.get("/orders-ready"',
        'router.get("/fulfillment-orders"'
      ),

      routeRegion(
        shipper,
        'router.get("/order/:token"',
        'router.post("/status/:token"'
      ),
    ];

    for (
      const region
      of regions
    ) {
      assert.doesNotMatch(
        region,
        /\.update\s*\(/
      );

      assert.doesNotMatch(
        region,
        /\.insert\s*\(/
      );

      assert.doesNotMatch(
        region,
        /\.delete\s*\(/
      );
    }
  }
);
