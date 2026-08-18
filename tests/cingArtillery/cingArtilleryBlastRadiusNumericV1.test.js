"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  normalizeBlastRadiusNumericV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryBlastRadiusNumericV1"
  );


test(
  "integer pixel blast radius maps exactly onto fixed-point lattice",
  () => {
    const result =
      normalizeBlastRadiusNumericV1({
        blastRadius:
          120,

        physicsFixedScale:
          1000,
      });


    assert.deepEqual(
      result,
      {
        blast_radius:
          120,

        physics_fixed_scale:
          1000,

        blast_radius_scaled:
          120000n,
      }
    );
  }
);


test(
  "fractional blast radius preserves exact scaled representation",
  () => {
    const result =
      normalizeBlastRadiusNumericV1({
        blastRadius:
          12.5,

        physicsFixedScale:
          1000,
      });


    assert.equal(
      result.blast_radius_scaled,
      12500n
    );
  }
);


test(
  "subpixel blast radius is accepted when exactly representable",
  () => {
    const result =
      normalizeBlastRadiusNumericV1({
        blastRadius:
          0.125,

        physicsFixedScale:
          1000,
      });


    assert.equal(
      result.blast_radius_scaled,
      125n
    );
  }
);


test(
  "blast radius not on fixed-point lattice fails closed",
  () => {
    assert.throws(
      () =>
        normalizeBlastRadiusNumericV1({
          blastRadius:
            0.0015,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_BLAST_RADIUS_NOT_EXACTLY_REPRESENTABLE_V1",
      }
    );
  }
);


test(
  "zero negative NaN and infinity fail closed",
  () => {
    for (
      const blastRadius
      of [
        0,
        -1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ]
    ) {
      assert.throws(
        () =>
          normalizeBlastRadiusNumericV1({
            blastRadius,

            physicsFixedScale:
              1000,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_BLAST_RADIUS_NUMERIC_V1",
        }
      );
    }
  }
);


test(
  "physics fixed scale must be a positive safe integer",
  () => {
    for (
      const physicsFixedScale
      of [
        0,
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
      ]
    ) {
      assert.throws(
        () =>
          normalizeBlastRadiusNumericV1({
            blastRadius:
              120,

            physicsFixedScale,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_BLAST_RADIUS_NUMERIC_V1",
        }
      );
    }
  }
);


test(
  "numeric result is immutable",
  () => {
    const result =
      normalizeBlastRadiusNumericV1({
        blastRadius:
          120,

        physicsFixedScale:
          1000,
      });


    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);
