"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

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
  return sweptProjectileIntersectsPlayerV1({
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
  "projectile crossing player between endpoint samples contacts",
  () => {
    assert.equal(
      query({
        playerCollider:
          player({
            radius_scaled:
              100n,
          }),

        projectileRadiusScaled:
          100n,
      }),
      true
    );
  }
);


test(
  "both endpoint projectile circles can miss while swept path contacts player",
  () => {
    assert.equal(
      sweptProjectileIntersectsPlayerV1({
        trajectorySegment:
          segment({
            start_x_scaled:
              0n,

            end_x_scaled:
              10000n,
          }),

        projectileRadiusScaled:
          100n,

        playerCollider:
          player({
            center_x_scaled:
              5000n,

            center_y_scaled:
              0n,

            radius_scaled:
              100n,
          }),
      }),
      true
    );
  }
);


test(
  "Minkowski radii exact tangent counts as swept contact",
  () => {
    assert.equal(
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
      true
    );
  }
);


test(
  "one scaled unit beyond combined-radius tangent is not contact",
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
      false
    );
  }
);


test(
  "contact at segment start is detected",
  () => {
    assert.equal(
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
      true
    );
  }
);


test(
  "contact at segment end is detected",
  () => {
    assert.equal(
      query({
        trajectorySegment:
          segment(),

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
      true
    );
  }
);


test(
  "stationary projectile segment preserves circle-contact semantics",
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
              2000n,

            center_y_scaled:
              2000n,

            radius_scaled:
              500n,
          }),
      }),
      true
    );
  }
);


test(
  "negative world coordinates remain valid swept geometry",
  () => {
    assert.equal(
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
      }),
      true
    );
  }
);


test(
  "reversing projectile segment preserves swept contact result",
  () => {
    const forward =
      sweptProjectileIntersectsPlayerV1({
        trajectorySegment:
          segment(),

        projectileRadiusScaled:
          500n,

        playerCollider:
          player({
            center_y_scaled:
              1499n,
          }),
      });

    const reverse =
      sweptProjectileIntersectsPlayerV1({
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
            center_y_scaled:
              1499n,
          }),
      });

    assert.equal(
      forward,
      true
    );

    assert.equal(
      reverse,
      forward
    );
  }
);


test(
  "arbitrarily large BigInt coordinates remain exact",
  () => {
    const base =
      10n ** 80n;

    assert.equal(
      sweptProjectileIntersectsPlayerV1({
        trajectorySegment:
          segment({
            start_x_scaled:
              base,

            start_y_scaled:
              -base,

            end_x_scaled:
              base + 10000n,

            end_y_scaled:
              -base,
          }),

        projectileRadiusScaled:
          1000n,

        playerCollider:
          player({
            center_x_scaled:
              base + 5000n,

            center_y_scaled:
              -base + 2000n,

            radius_scaled:
              1000n,
          }),
      }),
      true
    );
  }
);


test(
  "trajectory segment coordinates must be canonical BigInts",
  () => {
    const invalid = [
      1,
      "1",
      null,
      undefined,
    ];

    const fields = [
      "start_x_scaled",
      "start_y_scaled",
      "end_x_scaled",
      "end_y_scaled",
    ];

    for (
      const field
      of fields
    ) {
      for (
        const value
        of invalid
      ) {
        assert.throws(
          () =>
            query({
              trajectorySegment:
                segment({
                  [field]:
                    value,
                }),
            }),
          {
            code:
              "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_PLAYER_CONTACT_V1",
          }
        );
      }
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
            "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_PLAYER_CONTACT_V1",
        }
      );
    }
  }
);


test(
  "player collider must be canonical BigInt geometry with positive radius",
  () => {
    const invalid = [
      null,
      [],
      {},
      {
        center_x_scaled:
          0,

        center_y_scaled:
          0n,

        radius_scaled:
          1n,
      },
      {
        center_x_scaled:
          0n,

        center_y_scaled:
          0,

        radius_scaled:
          1n,
      },
      {
        center_x_scaled:
          0n,

        center_y_scaled:
          0n,

        radius_scaled:
          0n,
      },
      {
        center_x_scaled:
          0n,

        center_y_scaled:
          0n,

        radius_scaled:
          -1n,
      },
    ];

    for (
      const playerCollider
      of invalid
    ) {
      assert.throws(
        () =>
          query({
            playerCollider,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_PLAYER_CONTACT_V1",
        }
      );
    }
  }
);
