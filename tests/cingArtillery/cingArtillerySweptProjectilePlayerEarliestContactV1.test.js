"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  CONTACT_PARAMETER_KIND_V1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryContactParameterV1"
  );

const {
  sweptProjectilePlayerEarliestContactV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySweptProjectilePlayerEarliestContactV1"
  );

const {
  sweptProjectileIntersectsPlayerV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySweptProjectilePlayerContactV1"
  );


function segment(
  overrides = {}
) {
  return Object.freeze({
    start_x_scaled:
      0n,

    start_y_scaled:
      0n,

    end_x_scaled:
      10000n,

    end_y_scaled:
      0n,

    ...overrides,
  });
}


function player(
  overrides = {}
) {
  return Object.freeze({
    center_x_scaled:
      5000n,

    center_y_scaled:
      0n,

    radius_scaled:
      1000n,

    ...overrides,
  });
}


function query(
  overrides = {}
) {
  return sweptProjectilePlayerEarliestContactV1({
    trajectorySegment:
      segment(),

    projectileRadiusScaled:
      500n,

    playerCollider:
      player(),

    ...overrides,
  });
}


test(
  "Minkowski-expanded axial player entry returns exact rational parameter",
  () => {
    /*
     * projectile radius = 500
     * player radius     = 1000
     *
     * combined radius   = 1500
     *
     * center x = 5000
     * first contact x = 3500
     *
     * t = 3500/10000 = 7/20
     */
    assert.deepEqual(
      query(),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          7n,

        denominator:
          20n,
      }
    );
  }
);


test(
  "projectile crossing player between endpoint samples returns contact parameter",
  () => {
    const result =
      query({
        projectileRadiusScaled:
          100n,

        playerCollider:
          player({
            radius_scaled:
              100n,
          }),
      });

    assert.notEqual(
      result,
      null
    );
  }
);


test(
  "combined-radius exact tangent returns canonical rational parameter",
  () => {
    /*
     * horizontal trajectory
     * player center y = combined radius = 1500
     *
     * tangent at x = 5000 => t = 1/2
     */
    assert.deepEqual(
      query({
        projectileRadiusScaled:
          500n,

        playerCollider:
          player({
            center_y_scaled:
              1500n,

            radius_scaled:
              1000n,
          }),
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          2n,
      }
    );
  }
);


test(
  "one scaled unit beyond combined-radius tangent returns null",
  () => {
    assert.equal(
      query({
        projectileRadiusScaled:
          500n,

        playerCollider:
          player({
            center_y_scaled:
              1501n,

            radius_scaled:
              1000n,
          }),
      }),
      null
    );
  }
);


test(
  "contact at segment start returns canonical zero",
  () => {
    assert.deepEqual(
      query({
        trajectorySegment:
          segment({
            start_x_scaled:
              500n,

            end_x_scaled:
              10000n,
          }),

        projectileRadiusScaled:
          500n,

        playerCollider:
          player({
            center_x_scaled:
              0n,

            center_y_scaled:
              0n,

            radius_scaled:
              1n,
          }),
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          0n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "contact exactly at segment end returns canonical one",
  () => {
    assert.deepEqual(
      query({
        projectileRadiusScaled:
          500n,

        playerCollider:
          player({
            center_x_scaled:
              11500n,

            center_y_scaled:
              0n,

            radius_scaled:
              1000n,
          }),
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "stationary projectile already overlapping Minkowski player returns zero",
  () => {
    assert.deepEqual(
      query({
        trajectorySegment:
          segment({
            start_x_scaled:
              1000n,

            start_y_scaled:
              2000n,

            end_x_scaled:
              1000n,

            end_y_scaled:
              2000n,
          }),

        projectileRadiusScaled:
          500n,

        playerCollider:
          player({
            center_x_scaled:
              2000n,

            center_y_scaled:
              2000n,

            radius_scaled:
              500n,
          }),
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          0n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "stationary projectile outside Minkowski player returns null",
  () => {
    assert.equal(
      query({
        trajectorySegment:
          segment({
            start_x_scaled:
              1000n,

            start_y_scaled:
              2000n,

            end_x_scaled:
              1000n,

            end_y_scaled:
              2000n,
          }),

        projectileRadiusScaled:
          500n,

        playerCollider:
          player({
            center_x_scaled:
              2001n,

            center_y_scaled:
              2000n,

            radius_scaled:
              500n,
          }),
      }),
      null
    );
  }
);


test(
  "generic irrational Minkowski entry remains exact quadratic lower root",
  () => {
    /*
     * Segment:
     *   (0,0) -> (10,0)
     *
     * Player center:
     *   (5,1)
     *
     * projectile radius = 1
     * player radius     = 1
     * combined radius   = 2
     *
     * Therefore same exact circle fixture:
     *
     *   A = 100
     *   B = -100
     *   D = 1200
     */
    assert.deepEqual(
      sweptProjectilePlayerEarliestContactV1({
        trajectorySegment:
          segment({
            end_x_scaled:
              10n,
          }),

        projectileRadiusScaled:
          1n,

        playerCollider:
          player({
            center_x_scaled:
              5n,

            center_y_scaled:
              1n,

            radius_scaled:
              1n,
          }),
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT,

        a:
          100n,

        b:
          -100n,

        discriminant:
          1200n,
      }
    );
  }
);


test(
  "negative world coordinates preserve exact Minkowski entry",
  () => {
    const result =
      query({
        trajectorySegment:
          segment({
            start_x_scaled:
              -10000n,

            start_y_scaled:
              -5000n,

            end_x_scaled:
              10000n,

            end_y_scaled:
              -5000n,
          }),

        projectileRadiusScaled:
          250n,

        playerCollider:
          player({
            center_x_scaled:
              0n,

            center_y_scaled:
              -4000n,

            radius_scaled:
              750n,
          }),
      });

    assert.notEqual(
      result,
      null
    );
  }
);


test(
  "arbitrarily large translated coordinates remain exact",
  () => {
    const base =
      10n ** 80n;

    const result =
      sweptProjectilePlayerEarliestContactV1({
        trajectorySegment:
          segment({
            start_x_scaled:
              base,

            start_y_scaled:
              -base,

            end_x_scaled:
              base +
              10000n,

            end_y_scaled:
              -base,
          }),

        projectileRadiusScaled:
          1000n,

        playerCollider:
          player({
            center_x_scaled:
              base +
              5000n,

            center_y_scaled:
              -base +
              2000n,

            radius_scaled:
              1000n,
          }),
      });

    assert.notEqual(
      result,
      null
    );
  }
);


test(
  "returned contact parameter is frozen",
  () => {
    assert.ok(
      Object.isFrozen(
        query()
      )
    );
  }
);


test(
  "trajectory envelope must be an object",
  () => {
    for (
      const trajectorySegment
      of [
        null,
        [],
        1,
        "segment",
      ]
    ) {
      assert.throws(
        () =>
          query({
            trajectorySegment,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_PLAYER_EARLIEST_CONTACT_V1",
        }
      );
    }
  }
);


test(
  "player collider envelope must be an object",
  () => {
    for (
      const playerCollider
      of [
        null,
        [],
        1,
        "player",
      ]
    ) {
      assert.throws(
        () =>
          query({
            playerCollider,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_PLAYER_EARLIEST_CONTACT_V1",
        }
      );
    }
  }
);


test(
  "projectile radius must be positive canonical BigInt",
  () => {
    for (
      const projectileRadiusScaled
      of [
        0n,
        -1n,
        1,
        "1",
        null,
      ]
    ) {
      assert.throws(
        () =>
          query({
            projectileRadiusScaled,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_PLAYER_EARLIEST_CONTACT_V1",
        }
      );
    }
  }
);


test(
  "player radius must be positive canonical BigInt",
  () => {
    for (
      const radius_scaled
      of [
        0n,
        -1n,
        1,
        "1",
        null,
      ]
    ) {
      assert.throws(
        () =>
          query({
            playerCollider:
              player({
                radius_scaled,
              }),
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_PLAYER_EARLIEST_CONTACT_V1",
        }
      );
    }
  }
);


test(
  "invalid coordinate scalars fail closed through exact segment-circle authority",
  () => {
    const cases = [
      {
        trajectorySegment:
          segment({
            start_x_scaled:
              1,
          }),
      },
      {
        trajectorySegment:
          segment({
            start_y_scaled:
              "0",
          }),
      },
      {
        trajectorySegment:
          segment({
            end_x_scaled:
              null,
          }),
      },
      {
        trajectorySegment:
          segment({
            end_y_scaled:
              undefined,
          }),
      },
      {
        playerCollider:
          player({
            center_x_scaled:
              0,
          }),
      },
      {
        playerCollider:
          player({
            center_y_scaled:
              "0",
          }),
      },
    ];

    for (
      const overrides
      of cases
    ) {
      assert.throws(
        () =>
          query(
            overrides
          ),
        {
          code:
            "CING_ARTILLERY_INVALID_SEGMENT_CIRCLE_EARLIEST_CONTACT_PARAMETER_V1",
        }
      );
    }
  }
);


test(
  "nullability remains equivalent to locked boolean swept-player authority",
  () => {
    const fixtures = [
      {
        trajectorySegment:
          segment(),

        projectileRadiusScaled:
          500n,

        playerCollider:
          player(),
      },
      {
        trajectorySegment:
          segment(),

        projectileRadiusScaled:
          500n,

        playerCollider:
          player({
            center_y_scaled:
              1500n,
          }),
      },
      {
        trajectorySegment:
          segment(),

        projectileRadiusScaled:
          500n,

        playerCollider:
          player({
            center_y_scaled:
              1501n,
          }),
      },
      {
        trajectorySegment:
          segment({
            start_x_scaled:
              0n,

            end_x_scaled:
              0n,
          }),

        projectileRadiusScaled:
          1n,

        playerCollider:
          player({
            center_x_scaled:
              100n,

            radius_scaled:
              1n,
          }),
      },
    ];


    for (
      const fixture
      of fixtures
    ) {
      const booleanContact =
        sweptProjectileIntersectsPlayerV1(
          fixture
        );

      const parameter =
        sweptProjectilePlayerEarliestContactV1(
          fixture
        );

      assert.equal(
        parameter !== null,
        booleanContact
      );
    }
  }
);


test(
  "reverse earliest contact follows opposite-side entry rather than complement of forward entry",
  () => {
    /*
     * Minkowski geometry:
     *
     * segment:
     *   0 -> 10000
     *
     * player center:
     *   4000
     *
     * projectile radius:
     *   500
     *
     * player radius:
     *   500
     *
     * combined radius:
     *   1000
     *
     * Forward:
     *
     *   first contact x = 3000
     *   forward entry   = 3/10
     *
     *   exit x          = 5000
     *   forward exit    = 1/2
     *
     * Reverse:
     *
     *   starts at x=10000 and travels toward zero.
     *   Its first contact is x=5000.
     *
     *   reverse entry = 1/2
     *
     * Therefore reverse earliest is:
     *
     *   1 - forward exit
     *
     * NOT:
     *
     *   1 - forward entry = 7/10
     */
    const forward =
      sweptProjectilePlayerEarliestContactV1({
        trajectorySegment:
          segment({
            start_x_scaled:
              0n,

            end_x_scaled:
              10000n,
          }),

        projectileRadiusScaled:
          500n,

        playerCollider:
          player({
            center_x_scaled:
              4000n,

            center_y_scaled:
              0n,

            radius_scaled:
              500n,
          }),
      });

    const reverse =
      sweptProjectilePlayerEarliestContactV1({
        trajectorySegment:
          segment({
            start_x_scaled:
              10000n,

            end_x_scaled:
              0n,
          }),

        projectileRadiusScaled:
          500n,

        playerCollider:
          player({
            center_x_scaled:
              4000n,

            center_y_scaled:
              0n,

            radius_scaled:
              500n,
          }),
      });


    assert.deepEqual(
      forward,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          3n,

        denominator:
          10n,
      }
    );


    assert.deepEqual(
      reverse,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          2n,
      }
    );


    assert.notDeepEqual(
      reverse,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          7n,

        denominator:
          10n,
      }
    );
  }
);
