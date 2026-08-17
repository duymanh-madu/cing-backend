"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  CORDIC_ITERATIONS_V1,
  TRIG_ANGLE_SCALE_V1,
  TRIG_VALUE_SCALE_V1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryTrigAlgorithmV1Contract"
  );

const {
  CORDIC_ATAN_DEG_UNITS_V1,
  CORDIC_INVERSE_GAIN_VALUE_UNITS_V1,
  CORDIC_CONSTANTS_V1_SEMANTIC_SHA256,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryCordicConstantsV1.generated"
  );


test(
  "CORDIC V1 table length equals algorithm iteration count",
  () => {
    assert.equal(
      CORDIC_ITERATIONS_V1,
      32
    );

    assert.equal(
      CORDIC_ATAN_DEG_UNITS_V1.length,
      CORDIC_ITERATIONS_V1
    );
  }
);


test(
  "CORDIC V1 first micro rotation is exactly 45 degrees",
  () => {
    assert.equal(
      CORDIC_ATAN_DEG_UNITS_V1[0],
      45n *
        BigInt(
          TRIG_ANGLE_SCALE_V1
        )
    );
  }
);


test(
  "CORDIC V1 atan constants are positive BigInts and strictly decreasing",
  () => {
    for (
      let index = 0;
      index <
        CORDIC_ATAN_DEG_UNITS_V1.length;
      index += 1
    ) {
      const current =
        CORDIC_ATAN_DEG_UNITS_V1[
          index
        ];

      assert.equal(
        typeof current,
        "bigint"
      );

      assert.ok(
        current > 0n
      );

      if (index > 0) {
        const previous =
          CORDIC_ATAN_DEG_UNITS_V1[
            index - 1
          ];

        assert.ok(
          current <
            previous
        );
      }
    }
  }
);


test(
  "CORDIC V1 inverse gain is canonical on 1e9 lattice",
  () => {
    assert.equal(
      TRIG_VALUE_SCALE_V1,
      1000000000
    );

    assert.equal(
      CORDIC_INVERSE_GAIN_VALUE_UNITS_V1,
      607252935n
    );

    assert.ok(
      CORDIC_INVERSE_GAIN_VALUE_UNITS_V1 >
        0n
    );

    assert.ok(
      CORDIC_INVERSE_GAIN_VALUE_UNITS_V1 <
        BigInt(
          TRIG_VALUE_SCALE_V1
        )
    );
  }
);


test(
  "CORDIC V1 semantic checksum has exact SHA-256 representation",
  () => {
    assert.equal(
      typeof CORDIC_CONSTANTS_V1_SEMANTIC_SHA256,
      "string"
    );

    assert.match(
      CORDIC_CONSTANTS_V1_SEMANTIC_SHA256,
      /^[0-9a-f]{64}$/
    );
  }
);


test(
  "CORDIC V1 atan constant table is frozen",
  () => {
    assert.ok(
      Object.isFrozen(
        CORDIC_ATAN_DEG_UNITS_V1
      )
    );
  }
);
