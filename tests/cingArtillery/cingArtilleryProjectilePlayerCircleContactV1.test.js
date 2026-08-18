"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  projectileIntersectsPlayerCircleV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryProjectilePlayerCircleContactV1"
  );


function buildPlayerCollider(
  overrides = {}
) {
  return Object.freeze({
    center_x_scaled:
      10000n,

    center_y_scaled:
      20000n,

    radius_scaled:
      2000n,

    ...overrides,
  });
}


test(
  "projectile circle overlapping player circle intersects",
  () => {
    assert.equal(
      projectileIntersectsPlayerCircleV1({
        projectileXScaled:
          11000n,

        projectileYScaled:
          20000n,

        projectileRadiusScaled:
          1000n,

        playerCollider:
          buildPlayerCollider(),
      }),
      true
    );
  }
);


test(
  "exact tangent contact counts as intersection",
  () => {
    /*
     * player radius     = 2000
     * projectile radius = 1000
     * center distance   = 3000
     */
    assert.equal(
      projectileIntersectsPlayerCircleV1({
        projectileXScaled:
          13000n,

        projectileYScaled:
          20000n,

        projectileRadiusScaled:
          1000n,

        playerCollider:
          buildPlayerCollider(),
      }),
      true
    );
  }
);


test(
  "one scaled unit beyond tangent is not intersection",
  () => {
    assert.equal(
      projectileIntersectsPlayerCircleV1({
        projectileXScaled:
          13001n,

        projectileYScaled:
          20000n,

        projectileRadiusScaled:
          1000n,

        playerCollider:
          buildPlayerCollider(),
      }),
      false
    );
  }
);


test(
  "coincident projectile and player centers intersect",
  () => {
    assert.equal(
      projectileIntersectsPlayerCircleV1({
        projectileXScaled:
          10000n,

        projectileYScaled:
          20000n,

        projectileRadiusScaled:
          500n,

        playerCollider:
          buildPlayerCollider(),
      }),
      true
    );
  }
);


test(
  "negative world coordinates remain valid circle geometry",
  () => {
    assert.equal(
      projectileIntersectsPlayerCircleV1({
        projectileXScaled:
          -2000n,

        projectileYScaled:
          -1000n,

        projectileRadiusScaled:
          500n,

        playerCollider:
          buildPlayerCollider({
            center_x_scaled:
              -1000n,

            center_y_scaled:
              -1000n,

            radius_scaled:
              500n,
          }),
      }),
      true
    );
  }
);


test(
  "large exact BigInt geometry remains deterministic",
  () => {
    const base =
      10n ** 60n;

    assert.equal(
      projectileIntersectsPlayerCircleV1({
        projectileXScaled:
          base,

        projectileYScaled:
          -base,

        projectileRadiusScaled:
          2000n,

        playerCollider:
          buildPlayerCollider({
            center_x_scaled:
              base + 5000n,

            center_y_scaled:
              -base,

            radius_scaled:
              3000n,
          }),
      }),
      true
    );
  }
);


test(
  "projectile coordinates must be canonical BigInts",
  () => {
    const invalid = [
      1,
      "1",
      null,
      undefined,
    ];

    for (
      const projectileXScaled
      of invalid
    ) {
      assert.throws(
        () =>
          projectileIntersectsPlayerCircleV1({
            projectileXScaled,

            projectileYScaled:
              0n,

            projectileRadiusScaled:
              1000n,

            playerCollider:
              buildPlayerCollider(),
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PROJECTILE_PLAYER_CIRCLE_CONTACT_V1",
        }
      );
    }


    for (
      const projectileYScaled
      of invalid
    ) {
      assert.throws(
        () =>
          projectileIntersectsPlayerCircleV1({
            projectileXScaled:
              0n,

            projectileYScaled,

            projectileRadiusScaled:
              1000n,

            playerCollider:
              buildPlayerCollider(),
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PROJECTILE_PLAYER_CIRCLE_CONTACT_V1",
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
          projectileIntersectsPlayerCircleV1({
            projectileXScaled:
              0n,

            projectileYScaled:
              0n,

            projectileRadiusScaled,

            playerCollider:
              buildPlayerCollider(),
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PROJECTILE_PLAYER_CIRCLE_CONTACT_V1",
        }
      );
    }
  }
);


test(
  "player collider must contain canonical BigInt center and positive radius",
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
          projectileIntersectsPlayerCircleV1({
            projectileXScaled:
              0n,

            projectileYScaled:
              0n,

            projectileRadiusScaled:
              1n,

            playerCollider,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PROJECTILE_PLAYER_CIRCLE_CONTACT_V1",
        }
      );
    }
  }
);
