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
  PROJECTILE_WORLD_EXIT_KIND_V1,
  classifyProjectileWorldExitV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryProjectileWorldExitClassificationV1"
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
  return classifyProjectileWorldExitV1({
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
  "world exit kind contract is immutable and explicit",
  () => {
    assert.deepEqual(
      PROJECTILE_WORLD_EXIT_KIND_V1,
      {
        BOUNDARY_EXIT:
          "boundary_exit",

        ALREADY_OUTSIDE:
          "already_outside",
      }
    );


    assert.ok(
      Object.isFrozen(
        PROJECTILE_WORLD_EXIT_KIND_V1
      )
    );
  }
);


test(
  "segment remaining inside expanded world returns null",
  () => {
    assert.equal(
      query(),
      null
    );
  }
);


test(
  "center outside raw map but inside expanded world remains non-exit",
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
  "ordinary right exit classifies boundary_exit with exact parameter",
  () => {
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
        world_exit_kind:
          PROJECTILE_WORLD_EXIT_KIND_V1.BOUNDARY_EXIT,

        contact_parameter: {
          kind:
            CONTACT_PARAMETER_KIND_V1.RATIONAL,

          numerator:
            1n,

          denominator:
            2n,
        },
      }
    );
  }
);


test(
  "ordinary left exit classifies boundary_exit",
  () => {
    const result =
      query({
        trajectorySegment:
          segment({
            startX:
              100n,

            endX:
              -300n,
          }),
      });


    assert.equal(
      result.world_exit_kind,
      PROJECTILE_WORLD_EXIT_KIND_V1.BOUNDARY_EXIT
    );

    assert.deepEqual(
      result.contact_parameter,
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
  "ordinary top exit classifies boundary_exit",
  () => {
    const result =
      query({
        trajectorySegment:
          segment({
            startY:
              100n,

            endY:
              -300n,
          }),
      });


    assert.equal(
      result.world_exit_kind,
      PROJECTILE_WORLD_EXIT_KIND_V1.BOUNDARY_EXIT
    );
  }
);


test(
  "ordinary bottom exit classifies boundary_exit",
  () => {
    const result =
      query({
        trajectorySegment:
          segment({
            startY:
              3900n,

            endY:
              4300n,
          }),
      });


    assert.equal(
      result.world_exit_kind,
      PROJECTILE_WORLD_EXIT_KIND_V1.BOUNDARY_EXIT
    );
  }
);


test(
  "start on expanded boundary moving outward is boundary_exit at zero",
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
        world_exit_kind:
          PROJECTILE_WORLD_EXIT_KIND_V1.BOUNDARY_EXIT,

        contact_parameter: {
          kind:
            CONTACT_PARAMETER_KIND_V1.RATIONAL,

          numerator:
            0n,

          denominator:
            1n,
        },
      }
    );
  }
);


test(
  "start one lattice unit beyond right boundary is already_outside at zero",
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
        world_exit_kind:
          PROJECTILE_WORLD_EXIT_KIND_V1.ALREADY_OUTSIDE,

        contact_parameter: {
          kind:
            CONTACT_PARAMETER_KIND_V1.RATIONAL,

          numerator:
            0n,

          denominator:
            1n,
        },
      }
    );
  }
);


test(
  "boundary zero and already-outside zero remain semantically distinct",
  () => {
    const boundary =
      query({
        trajectorySegment:
          segment({
            startX:
              8100n,

            endX:
              8200n,
          }),
      });

    const outside =
      query({
        trajectorySegment:
          segment({
            startX:
              8101n,

            endX:
              8200n,
          }),
      });


    assert.deepEqual(
      boundary.contact_parameter,
      outside.contact_parameter
    );

    assert.notEqual(
      boundary.world_exit_kind,
      outside.world_exit_kind
    );
  }
);


test(
  "all four already-outside directions classify already_outside",
  () => {
    const starts = [
      [-101n, 2000n],
      [8101n, 2000n],
      [2000n, -101n],
      [2000n, 4101n],
    ];


    for (
      const [
        startX,
        startY,
      ]
      of starts
    ) {
      const result =
        query({
          trajectorySegment:
            segment({
              startX,
              startY,

              endX:
                startX,

              endY:
                startY,
            }),
        });


      assert.equal(
        result.world_exit_kind,
        PROJECTILE_WORLD_EXIT_KIND_V1.ALREADY_OUTSIDE
      );

      assert.deepEqual(
        result.contact_parameter,
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
  }
);


test(
  "endpoint exactly on expanded boundary remains null",
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
  "diagonal exit preserves exact parameter from contact authority",
  () => {
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
        world_exit_kind:
          PROJECTILE_WORLD_EXIT_KIND_V1.BOUNDARY_EXIT,

        contact_parameter: {
          kind:
            CONTACT_PARAMETER_KIND_V1.RATIONAL,

          numerator:
            1n,

          denominator:
            3n,
        },
      }
    );
  }
);


test(
  "classification result is frozen and reuses frozen contact parameter",
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

    assert.ok(
      Object.isFrozen(
        result.contact_parameter
      )
    );
  }
);


test(
  "invalid radius delegates through locked world-exit public contract",
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
  "invalid dimensions delegate through locked world-exit public contract",
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
  }
);


test(
  "invalid trajectory coordinates delegate through locked world-exit public contract",
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
  "missing classification envelope fails closed",
  () => {
    assert.throws(
      () =>
        classifyProjectileWorldExitV1(),
      {
        code:
          "CING_ARTILLERY_INVALID_PROJECTILE_WORLD_EXIT_CLASSIFICATION_V1",
      }
    );
  }
);
