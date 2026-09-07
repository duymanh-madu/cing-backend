"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  selectCanonicalGeocodeResult,
  ACCEPTED_GRANULARITIES,
  DELIVERY_CAPABLE_TYPES,
} =
  require(
    "../../shippingAddressGeocodingService"
  );


function result({
  latitude = 21.1,
  longitude = 106.1,
  formattedAddress = "Test address",
  placeId = "place-1",
  granularity = "ROOFTOP",
  types = ["street_address"],
} = {}) {
  return {
    location: {
      latitude,
      longitude,
    },

    formattedAddress,

    placeId,

    granularity,

    types,
  };
}


test(
  "one precise rooftop street address is accepted",
  () => {
    const value =
      selectCanonicalGeocodeResult({
        results: [
          result(),
        ],

        normalized_address:
          "Test address",
      });

    assert.equal(
      value.latitude,
      21.1
    );

    assert.equal(
      value.longitude,
      106.1
    );

    assert.equal(
      value.granularity,
      "ROOFTOP"
    );

    assert.deepEqual(
      value.types,
      [
        "street_address",
      ]
    );
  }
);


test(
  "multiple Google results fail closed as ambiguous",
  () => {
    assert.throws(
      () =>
        selectCanonicalGeocodeResult({
          results: [
            result({
              placeId:
                "a",
            }),

            result({
              placeId:
                "b",

              latitude:
                21.2,
            }),
          ],

          normalized_address:
            "Ambiguous address",
        }),
      error =>
        error?.code ===
        "DELIVERY_ADDRESS_AMBIGUOUS"
    );
  }
);


test(
  "approximate locality result is too coarse for delivery",
  () => {
    assert.throws(
      () =>
        selectCanonicalGeocodeResult({
          results: [
            result({
              granularity:
                "APPROXIMATE",

              types: [
                "locality",
                "political",
              ],
            }),
          ],

          normalized_address:
            "Từ Sơn",
        }),
      error =>
        error?.code ===
        "DELIVERY_ADDRESS_TOO_COARSE"
    );
  }
);


test(
  "geometric-center premise remains valid for named delivery location",
  () => {
    const value =
      selectCanonicalGeocodeResult({
        results: [
          result({
            granularity:
              "GEOMETRIC_CENTER",

            types: [
              "premise",
            ],
          }),
        ],

        normalized_address:
          "Named premise",
      });

    assert.equal(
      value.granularity,
      "GEOMETRIC_CENTER"
    );

    assert.deepEqual(
      value.types,
      [
        "premise",
      ]
    );
  }
);


test(
  "route-level result cannot become delivery destination",
  () => {
    assert.throws(
      () =>
        selectCanonicalGeocodeResult({
          results: [
            result({
              granularity:
                "GEOMETRIC_CENTER",

              types: [
                "route",
              ],
            }),
          ],

          normalized_address:
            "A road",
        }),
      error =>
        error?.code ===
        "DELIVERY_ADDRESS_TOO_COARSE"
    );
  }
);


test(
  "invalid provider coordinates fail closed",
  () => {
    assert.throws(
      () =>
        selectCanonicalGeocodeResult({
          results: [
            result({
              latitude:
                999,
            }),
          ],

          normalized_address:
            "Invalid",
        }),
      error =>
        error?.code ===
        "DELIVERY_GEOCODING_RESULT_INVALID"
    );
  }
);


test(
  "delivery granularity/type policy is explicit and bounded",
  () => {
    assert.deepEqual(
      [
        ...ACCEPTED_GRANULARITIES,
      ],
      [
        "ROOFTOP",
        "RANGE_INTERPOLATED",
        "GEOMETRIC_CENTER",
      ]
    );

    assert.equal(
      DELIVERY_CAPABLE_TYPES.has(
        "street_address"
      ),
      true
    );

    assert.equal(
      DELIVERY_CAPABLE_TYPES.has(
        "premise"
      ),
      true
    );

    assert.equal(
      DELIVERY_CAPABLE_TYPES.has(
        "route"
      ),
      false
    );

    assert.equal(
      DELIVERY_CAPABLE_TYPES.has(
        "locality"
      ),
      false
    );
  }
);
