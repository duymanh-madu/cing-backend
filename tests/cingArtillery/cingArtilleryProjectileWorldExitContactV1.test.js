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
  projectileWorldExitContactV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryProjectileWorldExitContactV1"
  );


const SCALE =
  1000;

const WIDTH =
  8;

const HEIGHT =
  4;

const RADIUS =
  100n;


function segment({
  startX =
    1000n,

  startY =
    1000n,

  endX =
    2000n,

  endY =
    1000n,
} = {}) {
  return {
    start_x_scaled:
      startX,

    start_y_scaled:
      startY,

    end_x_scaled:
      endX,

    end_y_scaled:
      endY,
  };
}


function query(
  overrides = {}
) {
  return projectileWorldExitContactV1({
    trajectorySegment:
      overrides.trajectorySegment ??
      segment(),

    projectileRadiusScaled:
      overrides.projectileRadiusScaled ??
      RADIUS,

    physicsFixedScale:
      overrides.physicsFixedScale ??
      SCALE,

    widthPx:
      overrides.widthPx ??
      WIDTH,

    heightPx:
      overrides.heightPx ??
      HEIGHT,
  });
}


test(
  "segment fully inside expanded world has no exit",
  () => {
    assert.equal(
      query(),
      null
    );
  }
);


test(
  "center may leave raw map while projectile circle still intersects world",
  () => {
    /*
     * Raw map right boundary:
     *
     *   8000
     *
     * Expanded projectile-center boundary:
     *
     *   8100
     *
     * End center at 8050 is outside raw map but circle
     * still overlaps the closed world.
     */
    assert.equal(
      query({
        trajectorySegment:
          segment({
            startX:
              7900n,

            endX:
              8050n,
          }),
      }),
      null
    );
  }
);


test(
  "right world exit occurs at expanded boundary",
  () => {
    /*
     * Expanded maxX:
     *
     *   8000 + 100 = 8100
     *
     * Segment:
     *
     *   7900 -> 8300
     *
     * Exit:
     *
     *   (8100 - 7900)
     *   ----------------
     *   (8300 - 7900)
     *
     *   = 200/400
     *   = 1/2
     */
    assert.deepEqual(
      query({
        trajectorySegment:
          segment({
            startX:
              7900n,

            endX:
              8300n,
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
  "left world exit occurs at negative radius boundary",
  () => {
    /*
     * Expanded minX = -100.
     *
     * 100 -> -300 exits at -100:
     *
     *   200/400 = 1/2
     */
    assert.deepEqual(
      query({
        trajectorySegment:
          segment({
            startX:
              100n,

            endX:
              -300n,
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
  "top world exit occurs at negative radius boundary",
  () => {
    assert.deepEqual(
      query({
        trajectorySegment:
          segment({
            startY:
              100n,

            endY:
              -300n,
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
  "bottom world exit occurs at height plus radius boundary",
  () => {
    /*
     * height = 4px
     * scale = 1000
     * radius = 100
     *
     * expanded maxY = 4100
     */
    assert.deepEqual(
      query({
        trajectorySegment:
          segment({
            startY:
              3900n,

            endY:
              4300n,
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
  "endpoint exactly on expanded closed boundary has no exit",
  () => {
    assert.equal(
      query({
        trajectorySegment:
          segment({
            startX:
              7900n,

            endX:
              8100n,
          }),
      }),
      null
    );
  }
);


test(
  "start on expanded boundary moving outward exits at zero",
  () => {
    assert.deepEqual(
      query({
        trajectorySegment:
          segment({
            startX:
              8100n,

            endX:
              8200n,
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
  "start already fully outside expanded world is immediate zero",
  () => {
    assert.deepEqual(
      query({
        trajectorySegment:
          segment({
            startX:
              8101n,

            endX:
              8200n,
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
  "start outside raw map but inside expanded world is not immediate OOB",
  () => {
    assert.equal(
      query({
        trajectorySegment:
          segment({
            startX:
              8050n,

            endX:
              7900n,
          }),
      }),
      null
    );
  }
);


test(
  "diagonal world exit chooses exact earliest expanded-axis exit",
  () => {
    /*
     * Expanded:
     *
     *   maxX = 8100
     *   maxY = 4100
     *
     * Start:
     *
     *   x = 7900
     *   y = 3900
     *
     * End:
     *
     *   x = 8300 => X exit = 200/400 = 1/2
     *   y = 4500 => Y exit = 200/600 = 1/3
     *
     * Earliest exit is Y = 1/3.
     */
    assert.deepEqual(
      query({
        trajectorySegment:
          segment({
            startX:
              7900n,

            startY:
              3900n,

            endX:
              8300n,

            endY:
              4500n,
          }),
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          3n,
      }
    );
  }
);


test(
  "larger projectile radius delays geometric world exit",
  () => {
    const small =
      query({
        projectileRadiusScaled:
          100n,

        trajectorySegment:
          segment({
            startX:
              7900n,

            endX:
              8500n,
          }),
      });

    const large =
      query({
        projectileRadiusScaled:
          500n,

        trajectorySegment:
          segment({
            startX:
              7900n,

            endX:
              8500n,
          }),
      });


    assert.deepEqual(
      small,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          3n,
      }
    );

    /*
     * Expanded maxX for radius 500:
     *
     *   8500
     *
     * Endpoint is still exactly on closed boundary.
     */
    assert.equal(
      large,
      null
    );
  }
);


test(
  "world exit result is frozen",
  () => {
    const result =
      query({
        trajectorySegment:
          segment({
            startX:
              7900n,

            endX:
              8300n,
          }),
      });


    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);


test(
  "invalid projectile radius fails closed",
  () => {
    assert.throws(
      () =>
        query({
          projectileRadiusScaled:
            0n,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_PROJECTILE_WORLD_EXIT_CONTACT_V1",
      }
    );
  }
);


test(
  "invalid physics fixed scale fails closed",
  () => {
    assert.throws(
      () =>
        query({
          physicsFixedScale:
            0,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_PROJECTILE_WORLD_EXIT_CONTACT_V1",
      }
    );
  }
);


test(
  "invalid world dimensions fail closed",
  () => {
    assert.throws(
      () =>
        query({
          widthPx:
            0,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_PROJECTILE_WORLD_EXIT_CONTACT_V1",
      }
    );

    assert.throws(
      () =>
        query({
          heightPx:
            0,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_PROJECTILE_WORLD_EXIT_CONTACT_V1",
      }
    );
  }
);


test(
  "trajectory coordinates must remain BigInt",
  () => {
    assert.throws(
      () =>
        query({
          trajectorySegment: {
            start_x_scaled:
              1000,

            start_y_scaled:
              1000n,

            end_x_scaled:
              2000n,

            end_y_scaled:
              1000n,
          },
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_PROJECTILE_WORLD_EXIT_CONTACT_V1",
      }
    );
  }
);


test(
  "missing envelope fails closed",
  () => {
    assert.throws(
      () =>
        projectileWorldExitContactV1(),
      {
        code:
          "CING_ARTILLERY_INVALID_PROJECTILE_WORLD_EXIT_CONTACT_V1",
      }
    );
  }
);
