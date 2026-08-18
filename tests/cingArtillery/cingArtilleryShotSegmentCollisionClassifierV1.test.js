"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  buildTrajectorySegmentV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryTrajectorySegmentV1"
  );

const {
  derivePlayerColliderV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryPlayerColliderV1"
  );

const {
  sweptProjectilePlayerEarliestContactV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySweptProjectilePlayerEarliestContactV1"
  );

const {
  sweptProjectileTerrainEarliestContactV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySweptProjectileTerrainEarliestContactV1"
  );

const {
  PLAYER_TERRAIN_COLLISION_KIND_V1,

  resolvePlayerTerrainCollisionPrecedenceV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryPlayerTerrainCollisionPrecedenceV1"
  );

const {
  CONTACT_PARAMETER_KIND_V1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryContactParameterV1"
  );

const {
  classifyShotSegmentCollisionV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryShotSegmentCollisionClassifierV1"
  );


const SCALE =
  1000;

const PROJECTILE_RADIUS =
  100n;


function makeMask({
  widthPx,
  heightPx,
  solidCells,
}) {
  const bytesPerRow =
    Math.floor(
      (widthPx + 7) /
      8
    );

  const mask =
    Buffer.alloc(
      bytesPerRow *
      heightPx
    );


  for (
    const [
      x,
      y,
    ]
    of solidCells
  ) {
    const byteOffset =
      y *
        bytesPerRow +
      Math.floor(
        x /
        8
      );

    const bitIndex =
      7 -
      (
        x %
        8
      );

    mask[byteOffset] |=
      1 <<
      bitIndex;
  }


  return mask;
}


function buildSegment({
  startX =
    0n,

  startY =
    1500n,

  endX =
    5000n,

  endY =
    1500n,
} = {}) {
  return buildTrajectorySegmentV1({
    physicsStepMs:
      20,

    fromSample: {
      step_index:
        0,

      elapsed_ms:
        0,

      x_scaled:
        startX,

      y_scaled:
        startY,
    },

    toSample: {
      step_index:
        1,

      elapsed_ms:
        20,

      x_scaled:
        endX,

      y_scaled:
        endY,
    },
  });
}


function buildPlayer({
  spawnX,
  spawnY =
    2,

  radiusScaled =
    1000n,

  centerOffsetYScaled =
    500n,
}) {
  return derivePlayerColliderV1({
    spawnX,
    spawnY,

    physicsFixedScale:
      SCALE,

    playerHitRadiusScaled:
      radiusScaled,

    playerHitCenterOffsetYScaled:
      centerOffsetYScaled,
  });
}


function classify({
  trajectorySegment =
    buildSegment(),

  projectileRadiusScaled =
    PROJECTILE_RADIUS,

  playerCollider =
    buildPlayer({
      spawnX:
        3,
    }),

  physicsFixedScale =
    SCALE,

  widthPx =
    8,

  heightPx =
    4,

  solidCells =
    [],

  collisionMask,
} = {}) {
  const mask =
    collisionMask ??
    makeMask({
      widthPx,
      heightPx,
      solidCells,
    });


  return classifyShotSegmentCollisionV1({
    trajectorySegment,
    projectileRadiusScaled,
    playerCollider,

    physicsFixedScale,

    widthPx,
    heightPx,

    collisionMask:
      mask,
  });
}


test(
  "no player or terrain contact returns null",
  () => {
    assert.equal(
      classify({
        playerCollider:
          buildPlayer({
            spawnX:
              7,
          }),

        solidCells:
          [],
      }),
      null
    );
  }
);


test(
  "player-only contact classifies player",
  () => {
    const result =
      classify({
        playerCollider:
          buildPlayer({
            spawnX:
              3,
          }),

        solidCells:
          [],
      });


    assert.notEqual(
      result,
      null
    );

    assert.equal(
      result.collision_kind,
      PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER
    );

    assert.deepEqual(
      result.contact_parameter,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          19n,

        denominator:
          50n,
      }
    );
  }
);


test(
  "terrain-only contact classifies terrain",
  () => {
    const widthPx =
      12;

    const heightPx =
      4;

    const result =
      classify({
        widthPx,
        heightPx,

        playerCollider:
          buildPlayer({
            spawnX:
              10,
          }),

        solidCells:
          [
            [2, 1],
          ],
      });


    assert.notEqual(
      result,
      null
    );

    assert.equal(
      result.collision_kind,
      PLAYER_TERRAIN_COLLISION_KIND_V1.TERRAIN
    );

    assert.deepEqual(
      result.contact_parameter,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          19n,

        denominator:
          50n,
      }
    );
  }
);


test(
  "earlier player contact beats later terrain contact",
  () => {
    /*
     * Player:
     *
     *   center x = 3000
     *   combined radius = 1100
     *   entry x = 1900
     *   t = 19/50
     *
     * Terrain cell [4,1]:
     *
     *   expanded left x = 3900
     *   t = 39/50
     */
    const result =
      classify({
        playerCollider:
          buildPlayer({
            spawnX:
              3,
          }),

        solidCells:
          [
            [4, 1],
          ],
      });


    assert.equal(
      result.collision_kind,
      PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER
    );

    assert.deepEqual(
      result.contact_parameter,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          19n,

        denominator:
          50n,
      }
    );
  }
);


test(
  "earlier terrain contact beats later player contact",
  () => {
    /*
     * Terrain cell [1,1]:
     *
     *   expanded left x = 900
     *   t = 9/50
     *
     * Player:
     *
     *   center x = 4000
     *   combined radius = 1100
     *   entry x = 2900
     *   t = 29/50
     */
    const result =
      classify({
        playerCollider:
          buildPlayer({
            spawnX:
              4,
          }),

        solidCells:
          [
            [1, 1],
          ],
      });


    assert.equal(
      result.collision_kind,
      PLAYER_TERRAIN_COLLISION_KIND_V1.TERRAIN
    );

    assert.deepEqual(
      result.contact_parameter,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          9n,

        denominator:
          50n,
      }
    );
  }
);


test(
  "exact simultaneous player and terrain contact delegates tie to player precedence",
  () => {
    /*
     * Canonical player collider:
     *
     *   spawn_x = 3px
     *   center_x = 3000
     *   player radius = 1000
     *
     * Projectile radius:
     *
     *   100
     *
     * Combined player radius:
     *
     *   1100
     *
     * Player entry:
     *
     *   3000 - 1100 = 1900
     *
     * Terrain cell [2,1] expanded left boundary:
     *
     *   2000 - 100 = 1900
     *
     * Both contacts therefore occur exactly at:
     *
     *   1900 / 5000 = 19/50
     *
     * V1 precedence requires PLAYER.
     */
    const result =
      classify({
        playerCollider:
          buildPlayer({
            spawnX:
              3,
          }),

        solidCells:
          [
            [2, 1],
          ],
      });


    assert.equal(
      result.collision_kind,
      PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER
    );

    assert.deepEqual(
      result.contact_parameter,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          19n,

        denominator:
          50n,
      }
    );
  }
);


test(
  "classifier result equals independent composition of locked authorities",
  () => {
    const scenarios = [
      {
        playerCollider:
          buildPlayer({
            spawnX:
              7,
          }),

        solidCells:
          [],
      },

      {
        playerCollider:
          buildPlayer({
            spawnX:
              3,
          }),

        solidCells:
          [],
      },

      {
        playerCollider:
          buildPlayer({
            spawnX:
              10,
          }),

        widthPx:
          12,

        solidCells:
          [
            [2, 1],
          ],
      },

      {
        playerCollider:
          buildPlayer({
            spawnX:
              3,
          }),

        solidCells:
          [
            [4, 1],
          ],
      },

      {
        playerCollider:
          buildPlayer({
            spawnX:
              4,
          }),

        solidCells:
          [
            [1, 1],
          ],
      },

      {
        playerCollider:
          buildPlayer({
            spawnX:
              3,
          }),

        solidCells:
          [
            [2, 1],
          ],
      },

      {
        trajectorySegment:
          buildSegment({
            startX:
              5000n,

            endX:
              0n,
          }),

        playerCollider:
          buildPlayer({
            spawnX:
              2,
          }),

        solidCells:
          [
            [1, 1],
            [4, 1],
          ],
      },
    ];


    for (
      const scenario
      of scenarios
    ) {
      const trajectorySegment =
        scenario.trajectorySegment ??
        buildSegment();

      const projectileRadiusScaled =
        PROJECTILE_RADIUS;

      const playerCollider =
        scenario.playerCollider;

      const physicsFixedScale =
        SCALE;

      const widthPx =
        scenario.widthPx ??
        8;

      const heightPx =
        4;

      const collisionMask =
        makeMask({
          widthPx,
          heightPx,

          solidCells:
            scenario.solidCells,
        });


      const playerContact =
        sweptProjectilePlayerEarliestContactV1({
          trajectorySegment,
          projectileRadiusScaled,
          playerCollider,
        });


      const terrainContact =
        sweptProjectileTerrainEarliestContactV1({
          trajectorySegment,
          projectileRadiusScaled,

          physicsFixedScale,

          widthPx,
          heightPx,
          collisionMask,
        });


      const expected =
        resolvePlayerTerrainCollisionPrecedenceV1({
          playerContact,
          terrainContact,
        });


      const actual =
        classifyShotSegmentCollisionV1({
          trajectorySegment,
          projectileRadiusScaled,
          playerCollider,

          physicsFixedScale,

          widthPx,
          heightPx,
          collisionMask,
        });


      assert.deepEqual(
        actual,
        expected
      );
    }
  }
);


test(
  "classifier preserves reverse-direction geometric precedence",
  () => {
    const result =
      classify({
        trajectorySegment:
          buildSegment({
            startX:
              5000n,

            endX:
              0n,
          }),

        playerCollider:
          buildPlayer({
            spawnX:
              2,
          }),

        solidCells:
          [
            [1, 1],
            [4, 1],
          ],
      });


    /*
     * From x=5000 moving left:
     *
     * terrain [4,1] expanded right boundary = 5100,
     * so projectile begins overlapping terrain at t=0.
     *
     * Terrain must therefore win before later player
     * contact regardless of terrain row-major ordering.
     */
    assert.equal(
      result.collision_kind,
      PLAYER_TERRAIN_COLLISION_KIND_V1.TERRAIN
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
);


test(
  "classifier returns immutable precedence result",
  () => {
    const result =
      classify({
        playerCollider:
          buildPlayer({
            spawnX:
              3,
          }),

        solidCells:
          [
            [4, 1],
          ],
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
  "invalid player collider fails through locked player earliest authority",
  () => {
    assert.throws(
      () =>
        classify({
          playerCollider: {
            center_x_scaled:
              3000n,

            center_y_scaled:
              1500n,

            radius_scaled:
              0n,
          },
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_PLAYER_EARLIEST_CONTACT_V1",
      }
    );
  }
);


test(
  "invalid terrain bitmask fails through locked terrain earliest authority",
  () => {
    assert.throws(
      () =>
        classify({
          playerCollider:
            buildPlayer({
              spawnX:
                7,
            }),

          collisionMask:
            Buffer.alloc(
              0
            ),
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_TERRAIN_EARLIEST_BITMASK_V1",
      }
    );
  }
);


test(
  "invalid trajectory coordinate fails through existing exact geometry authority",
  () => {
    assert.throws(
      () =>
        classify({
          trajectorySegment: {
            start_x_scaled:
              0,

            start_y_scaled:
              1500n,

            end_x_scaled:
              5000n,

            end_y_scaled:
              1500n,
          },
        })
    );
  }
);


test(
  "missing classifier envelope fails closed through child authorities",
  () => {
    assert.throws(
      () =>
        classifyShotSegmentCollisionV1()
    );
  }
);
