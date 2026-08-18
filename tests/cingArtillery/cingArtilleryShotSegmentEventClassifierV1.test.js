"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  derivePlayerColliderV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryPlayerColliderV1"
  );

const {
  classifyShotSegmentCollisionV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryShotSegmentCollisionClassifierV1"
  );

const {
  classifyProjectileWorldExitV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryProjectileWorldExitClassificationV1"
  );

const {
  resolveCollisionWorldExitPrecedenceV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryCollisionWorldExitPrecedenceV1"
  );

const {
  classifyShotSegmentEventV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryShotSegmentEventClassifierV1"
  );


const SCALE =
  1000;

const WIDTH =
  12;

const HEIGHT =
  6;

const PROJECTILE_RADIUS =
  100n;


function makeMask({
  widthPx =
    WIDTH,

  heightPx =
    HEIGHT,

  solidCells =
    [],
} = {}) {
  const bytesPerRow =
    Math.ceil(
      widthPx / 8
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
    const byteIndex =
      y *
      bytesPerRow +
      Math.floor(
        x / 8
      );

    const bitIndex =
      7 -
      (
        x % 8
      );

    mask[byteIndex] |=
      1 << bitIndex;
  }


  return mask;
}


function trajectory({
  startX =
    1000n,

  startY =
    2000n,

  endX =
    2000n,

  endY =
    2000n,
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


function playerCollider({
  spawnX =
    6,

  spawnY =
    3,
} = {}) {
  return derivePlayerColliderV1({
    spawnX,
    spawnY,

    physicsFixedScale:
      SCALE,

    playerHitRadiusScaled:
      500n,

    playerHitCenterOffsetYScaled:
      500n,
  });
}


function query(
  overrides = {}
) {
  return classifyShotSegmentEventV1({
    trajectorySegment:
      overrides.trajectorySegment ??
      trajectory(),

    projectileRadiusScaled:
      overrides.projectileRadiusScaled ??
      PROJECTILE_RADIUS,

    playerCollider:
      overrides.playerCollider ??
      playerCollider(),

    physicsFixedScale:
      overrides.physicsFixedScale ??
      SCALE,

    widthPx:
      overrides.widthPx ??
      WIDTH,

    heightPx:
      overrides.heightPx ??
      HEIGHT,

    collisionMask:
      overrides.collisionMask ??
      makeMask(),
  });
}


test(
  "no collision and no world exit returns null",
  () => {
    assert.equal(
      query(),
      null
    );
  }
);


test(
  "player collision inside world classifies collision event",
  () => {
    const result =
      query({
        trajectorySegment:
          trajectory({
            startX:
              4000n,

            startY:
              2500n,

            endX:
              8000n,

            endY:
              2500n,
          }),
      });


    assert.equal(
      result.segment_event_kind,
      "collision"
    );

    assert.equal(
      result.collision_kind,
      "player"
    );

    assert.equal(
      result.world_exit_kind,
      null
    );
  }
);


test(
  "terrain collision inside world classifies terrain collision event",
  () => {
    const result =
      query({
        trajectorySegment:
          trajectory({
            startX:
              1000n,

            startY:
              2500n,

            endX:
              5000n,

            endY:
              2500n,
          }),

        playerCollider:
          playerCollider({
            spawnX:
              10,

            spawnY:
              5,
          }),

        collisionMask:
          makeMask({
            solidCells: [
              [3, 2],
            ],
          }),
      });


    assert.equal(
      result.segment_event_kind,
      "collision"
    );

    assert.equal(
      result.collision_kind,
      "terrain"
    );

    assert.equal(
      result.world_exit_kind,
      null
    );
  }
);


test(
  "world boundary exit without collision classifies world_exit",
  () => {
    const result =
      query({
        trajectorySegment:
          trajectory({
            startX:
              11800n,

            startY:
              1000n,

            endX:
              12500n,

            endY:
              1000n,
          }),

        playerCollider:
          playerCollider({
            spawnX:
              2,

            spawnY:
              5,
          }),
      });


    assert.equal(
      result.segment_event_kind,
      "world_exit"
    );

    assert.equal(
      result.collision_kind,
      null
    );

    assert.equal(
      result.world_exit_kind,
      "boundary_exit"
    );
  }
);


test(
  "already outside expanded world classifies immediate world_exit",
  () => {
    const result =
      query({
        trajectorySegment:
          trajectory({
            startX:
              12101n,

            startY:
              1000n,

            endX:
              12500n,

            endY:
              1000n,
          }),

        playerCollider:
          playerCollider({
            spawnX:
              2,

            spawnY:
              5,
          }),
      });


    assert.equal(
      result.segment_event_kind,
      "world_exit"
    );

    assert.equal(
      result.world_exit_kind,
      "already_outside"
    );

    assert.equal(
      result.contact_parameter.numerator,
      0n
    );

    assert.equal(
      result.contact_parameter.denominator,
      1n
    );
  }
);


test(
  "earlier player collision beats later boundary exit",
  () => {
    const result =
      query({
        trajectorySegment:
          trajectory({
            startX:
              5000n,

            startY:
              2500n,

            endX:
              12500n,

            endY:
              2500n,
          }),

        playerCollider:
          playerCollider({
            spawnX:
              8,

            spawnY:
              3,
          }),
      });


    assert.equal(
      result.segment_event_kind,
      "collision"
    );

    assert.equal(
      result.collision_kind,
      "player"
    );
  }
);


test(
  "earlier terrain collision beats later boundary exit",
  () => {
    const result =
      query({
        trajectorySegment:
          trajectory({
            startX:
              5000n,

            startY:
              2500n,

            endX:
              12500n,

            endY:
              2500n,
          }),

        playerCollider:
          playerCollider({
            spawnX:
              2,

            spawnY:
              5,
          }),

        collisionMask:
          makeMask({
            solidCells: [
              [8, 2],
            ],
          }),
      });


    assert.equal(
      result.segment_event_kind,
      "collision"
    );

    assert.equal(
      result.collision_kind,
      "terrain"
    );
  }
);


test(
  "earlier boundary exit beats later external player contact",
  () => {
    /*
     * Expanded right world boundary:
     *
     *   width 12 * 1000 + projectile radius 100
     *   = 12100
     *
     * Player collider is intentionally outside raw world,
     * proving precedence rather than assuming player geometry
     * is always map-contained.
     */
    const externalPlayer = {
      spawn_x_scaled:
        13000n,

      spawn_y_scaled:
        2500n,

      center_x_scaled:
        13000n,

      center_y_scaled:
        2500n,

      radius_scaled:
        500n,
    };


    const result =
      query({
        trajectorySegment:
          trajectory({
            startX:
              11000n,

            startY:
              2500n,

            endX:
              14000n,

            endY:
              2500n,
          }),

        playerCollider:
          externalPlayer,
      });


    assert.equal(
      result.segment_event_kind,
      "world_exit"
    );

    assert.equal(
      result.world_exit_kind,
      "boundary_exit"
    );
  }
);


test(
  "already_outside wins even when player collision exists at zero",
  () => {
    const externalPlayer = {
      spawn_x_scaled:
        12200n,

      spawn_y_scaled:
        2500n,

      center_x_scaled:
        12200n,

      center_y_scaled:
        2500n,

      radius_scaled:
        500n,
    };


    const result =
      query({
        trajectorySegment:
          trajectory({
            startX:
              12101n,

            startY:
              2500n,

            endX:
              12500n,

            endY:
              2500n,
          }),

        playerCollider:
          externalPlayer,
      });


    assert.equal(
      result.segment_event_kind,
      "world_exit"
    );

    assert.equal(
      result.world_exit_kind,
      "already_outside"
    );

    assert.equal(
      result.contact_parameter.numerator,
      0n
    );
  }
);


test(
  "result equals independent composition of all three locked authorities",
  () => {
    const envelope = {
      trajectorySegment:
        trajectory({
          startX:
            5000n,

          startY:
            2500n,

          endX:
            12500n,

          endY:
            2500n,
        }),

      projectileRadiusScaled:
        PROJECTILE_RADIUS,

      playerCollider:
        playerCollider({
          spawnX:
            8,

          spawnY:
            3,
        }),

      physicsFixedScale:
        SCALE,

      widthPx:
        WIDTH,

      heightPx:
        HEIGHT,

      collisionMask:
        makeMask({
          solidCells: [
            [10, 2],
          ],
        }),
    };


    const collision =
      classifyShotSegmentCollisionV1(
        envelope
      );

    const worldExit =
      classifyProjectileWorldExitV1({
        trajectorySegment:
          envelope.trajectorySegment,

        projectileRadiusScaled:
          envelope.projectileRadiusScaled,

        physicsFixedScale:
          envelope.physicsFixedScale,

        widthPx:
          envelope.widthPx,

        heightPx:
          envelope.heightPx,
      });

    const independentlyResolved =
      resolveCollisionWorldExitPrecedenceV1({
        collision,
        worldExit,
      });

    const classified =
      classifyShotSegmentEventV1(
        envelope
      );


    assert.deepEqual(
      classified,
      independentlyResolved
    );
  }
);


test(
  "classifier result is frozen",
  () => {
    const result =
      query({
        trajectorySegment:
          trajectory({
            startX:
              11800n,

            startY:
              1000n,

            endX:
              12500n,

            endY:
              1000n,
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
  "invalid collision mask still fails through locked collision classifier",
  () => {
    assert.throws(
      () =>
        query({
          collisionMask:
            Buffer.alloc(0),
        })
    );
  }
);


test(
  "invalid world dimensions fail closed through child authorities",
  () => {
    assert.throws(
      () =>
        query({
          widthPx:
            0,
        })
    );
  }
);


test(
  "invalid trajectory scalar fails through locked child authorities",
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
        })
    );
  }
);


test(
  "missing envelope fails closed through locked child authorities",
  () => {
    assert.throws(
      () =>
        classifyShotSegmentEventV1()
    );
  }
);
