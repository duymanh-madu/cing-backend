"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  normalizeCollisionGeometryRulesV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryCollisionGeometryNumericV1"
  );


test(
  "integer collision geometry normalizes exactly",
  () => {
    const result =
      normalizeCollisionGeometryRulesV1({
        projectileRadiusPx:
          1,

        playerHitRadiusPx:
          2,

        playerHitCenterOffsetYPx:
          1,

        physicsFixedScale:
          1000,
      });

    assert.deepEqual(
      result,
      {
        projectile_radius_scaled:
          1000n,

        player_hit_radius_scaled:
          2000n,

        player_hit_center_offset_y_scaled:
          1000n,
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
  "fractional collision geometry is canonical when exactly on lattice",
  () => {
    const result =
      normalizeCollisionGeometryRulesV1({
        projectileRadiusPx:
          1.25,

        playerHitRadiusPx:
          2.5,

        playerHitCenterOffsetYPx:
          1.75,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      result.projectile_radius_scaled,
      1250n
    );

    assert.equal(
      result.player_hit_radius_scaled,
      2500n
    );

    assert.equal(
      result.player_hit_center_offset_y_scaled,
      1750n
    );
  }
);


test(
  "subpixel positive geometry is supported when lattice represents it exactly",
  () => {
    const result =
      normalizeCollisionGeometryRulesV1({
        projectileRadiusPx:
          0.25,

        playerHitRadiusPx:
          0.75,

        playerHitCenterOffsetYPx:
          0.5,

        physicsFixedScale:
          1000,
      });

    assert.deepEqual(
      result,
      {
        projectile_radius_scaled:
          250n,

        player_hit_radius_scaled:
          750n,

        player_hit_center_offset_y_scaled:
          500n,
      }
    );
  }
);


test(
  "projectile radius outside physics lattice fails closed",
  () => {
    assert.throws(
      () =>
        normalizeCollisionGeometryRulesV1({
          projectileRadiusPx:
            1.0001,

          playerHitRadiusPx:
            2,

          playerHitCenterOffsetYPx:
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
  "player radius outside physics lattice fails closed",
  () => {
    assert.throws(
      () =>
        normalizeCollisionGeometryRulesV1({
          projectileRadiusPx:
            1,

          playerHitRadiusPx:
            2.0001,

          playerHitCenterOffsetYPx:
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
  "player center offset outside physics lattice fails closed",
  () => {
    assert.throws(
      () =>
        normalizeCollisionGeometryRulesV1({
          projectileRadiusPx:
            1,

          playerHitRadiusPx:
            2,

          playerHitCenterOffsetYPx:
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


test(
  "non-positive geometry fails closed",
  () => {
    assert.throws(
      () =>
        normalizeCollisionGeometryRulesV1({
          projectileRadiusPx:
            0,

          playerHitRadiusPx:
            2,

          playerHitCenterOffsetYPx:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_COLLISION_GEOMETRY_NUMERIC_V1",
      }
    );

    assert.throws(
      () =>
        normalizeCollisionGeometryRulesV1({
          projectileRadiusPx:
            1,

          playerHitRadiusPx:
            0,

          playerHitCenterOffsetYPx:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_COLLISION_GEOMETRY_NUMERIC_V1",
      }
    );

    assert.throws(
      () =>
        normalizeCollisionGeometryRulesV1({
          projectileRadiusPx:
            1,

          playerHitRadiusPx:
            2,

          playerHitCenterOffsetYPx:
            0,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_COLLISION_GEOMETRY_NUMERIC_V1",
      }
    );
  }
);


test(
  "numeric authority does not own projectile/player gameplay relation",
  () => {
    const equal =
      normalizeCollisionGeometryRulesV1({
        projectileRadiusPx:
          2,

        playerHitRadiusPx:
          2,

        playerHitCenterOffsetYPx:
          1,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      equal.projectile_radius_scaled,
      2000n
    );

    assert.equal(
      equal.player_hit_radius_scaled,
      2000n
    );

    const largerProjectile =
      normalizeCollisionGeometryRulesV1({
        projectileRadiusPx:
          3,

        playerHitRadiusPx:
          2,

        playerHitCenterOffsetYPx:
          1,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      largerProjectile.projectile_radius_scaled,
      3000n
    );

    assert.equal(
      largerProjectile.player_hit_radius_scaled,
      2000n
    );
  }
);

test(
  "scaled geometry cannot exceed canonical safe magnitude",
  () => {
    assert.throws(
      () =>
        normalizeCollisionGeometryRulesV1({
          projectileRadiusPx:
            1,

          playerHitRadiusPx:
            Number.MAX_SAFE_INTEGER,

          playerHitCenterOffsetYPx:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_RANGE_ERROR",
      }
    );
  }
);
