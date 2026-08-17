"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  normalizeMuzzleGeometryRulesV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryMuzzleGeometryNumericV1"
  );


test(
  "integer muzzle offsets normalize exactly",
  () => {
    const result =
      normalizeMuzzleGeometryRulesV1({
        muzzleOffsetForwardPx:
          3,

        muzzleOffsetUpPx:
          7,

        physicsFixedScale:
          1000,
      });

    assert.deepEqual(
      result,
      {
        muzzle_offset_forward_scaled:
          3000n,

        muzzle_offset_up_scaled:
          7000n,
      }
    );

    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);


test(
  "fractional muzzle offsets normalize exactly when lattice supports them",
  () => {
    const result =
      normalizeMuzzleGeometryRulesV1({
        muzzleOffsetForwardPx:
          2.5,

        muzzleOffsetUpPx:
          7.25,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      result.muzzle_offset_forward_scaled,
      2500n
    );

    assert.equal(
      result.muzzle_offset_up_scaled,
      7250n
    );
  }
);


test(
  "zero forward offset is canonical",
  () => {
    const result =
      normalizeMuzzleGeometryRulesV1({
        muzzleOffsetForwardPx:
          0,

        muzzleOffsetUpPx:
          1,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      result.muzzle_offset_forward_scaled,
      0n
    );
  }
);


test(
  "negative forward offset fails closed",
  () => {
    assert.throws(
      () =>
        normalizeMuzzleGeometryRulesV1({
          muzzleOffsetForwardPx:
            -1,

          muzzleOffsetUpPx:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_MUZZLE_GEOMETRY_NUMERIC_V1",
      }
    );
  }
);


test(
  "non-positive upward offset fails closed",
  () => {
    assert.throws(
      () =>
        normalizeMuzzleGeometryRulesV1({
          muzzleOffsetForwardPx:
            0,

          muzzleOffsetUpPx:
            0,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_MUZZLE_GEOMETRY_NUMERIC_V1",
      }
    );
  }
);


test(
  "forward offset outside physics lattice fails closed",
  () => {
    assert.throws(
      () =>
        normalizeMuzzleGeometryRulesV1({
          muzzleOffsetForwardPx:
            2.0001,

          muzzleOffsetUpPx:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "upward offset outside physics lattice fails closed",
  () => {
    assert.throws(
      () =>
        normalizeMuzzleGeometryRulesV1({
          muzzleOffsetForwardPx:
            0,

          muzzleOffsetUpPx:
            1.0001,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);
