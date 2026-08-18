"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  createRationalContactParameterV1,
  createQuadraticLowerRootContactParameterV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryContactParameterV1"
  );

const {
  PLAYER_TERRAIN_COLLISION_KIND_V1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryPlayerTerrainCollisionPrecedenceV1"
  );

const {
  PROJECTILE_WORLD_EXIT_KIND_V1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryProjectileWorldExitClassificationV1"
  );

const {
  COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1,
  resolveCollisionWorldExitPrecedenceV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryCollisionWorldExitPrecedenceV1"
  );


function rational(
  numerator,
  denominator
) {
  return createRationalContactParameterV1({
    numerator,
    denominator,
  });
}


function collision({
  kind =
    PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER,

  parameter =
    rational(
      1n,
      2n
    ),
} = {}) {
  return {
    collision_kind:
      kind,

    contact_parameter:
      parameter,
  };
}


function worldExit({
  kind =
    PROJECTILE_WORLD_EXIT_KIND_V1.BOUNDARY_EXIT,

  parameter =
    rational(
      3n,
      4n
    ),
} = {}) {
  return {
    world_exit_kind:
      kind,

    contact_parameter:
      parameter,
  };
}


test(
  "segment event kind contract is immutable and explicit",
  () => {
    assert.deepEqual(
      COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1,
      {
        COLLISION:
          "collision",

        WORLD_EXIT:
          "world_exit",
      }
    );

    assert.ok(
      Object.isFrozen(
        COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1
      )
    );
  }
);


test(
  "no collision and no world exit returns null",
  () => {
    assert.equal(
      resolveCollisionWorldExitPrecedenceV1({
        collision:
          null,

        worldExit:
          null,
      }),
      null
    );
  }
);


test(
  "collision-only selects collision",
  () => {
    assert.deepEqual(
      resolveCollisionWorldExitPrecedenceV1({
        collision:
          collision(),

        worldExit:
          null,
      }),
      {
        segment_event_kind:
          COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.COLLISION,

        collision_kind:
          PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER,

        world_exit_kind:
          null,

        contact_parameter:
          rational(
            1n,
            2n
          ),
      }
    );
  }
);


test(
  "boundary-world-exit-only selects world exit",
  () => {
    assert.deepEqual(
      resolveCollisionWorldExitPrecedenceV1({
        collision:
          null,

        worldExit:
          worldExit(),
      }),
      {
        segment_event_kind:
          COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.WORLD_EXIT,

        collision_kind:
          null,

        world_exit_kind:
          PROJECTILE_WORLD_EXIT_KIND_V1.BOUNDARY_EXIT,

        contact_parameter:
          rational(
            3n,
            4n
          ),
      }
    );
  }
);


test(
  "earlier collision beats later boundary exit",
  () => {
    const result =
      resolveCollisionWorldExitPrecedenceV1({
        collision:
          collision({
            parameter:
              rational(
                1n,
                4n
              ),
          }),

        worldExit:
          worldExit({
            parameter:
              rational(
                3n,
                4n
              ),
          }),
      });


    assert.equal(
      result.segment_event_kind,
      COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.COLLISION
    );

    assert.equal(
      result.contact_parameter.numerator,
      1n
    );

    assert.equal(
      result.contact_parameter.denominator,
      4n
    );
  }
);


test(
  "earlier boundary exit beats later collision",
  () => {
    const result =
      resolveCollisionWorldExitPrecedenceV1({
        collision:
          collision({
            parameter:
              rational(
                3n,
                4n
              ),
          }),

        worldExit:
          worldExit({
            parameter:
              rational(
                1n,
                4n
              ),
          }),
      });


    assert.equal(
      result.segment_event_kind,
      COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.WORLD_EXIT
    );

    assert.equal(
      result.world_exit_kind,
      PROJECTILE_WORLD_EXIT_KIND_V1.BOUNDARY_EXIT
    );
  }
);


test(
  "exact rational boundary tie selects collision",
  () => {
    const parameter =
      rational(
        1n,
        2n
      );


    const result =
      resolveCollisionWorldExitPrecedenceV1({
        collision:
          collision({
            parameter,
          }),

        worldExit:
          worldExit({
            parameter,
          }),
      });


    assert.equal(
      result.segment_event_kind,
      COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.COLLISION
    );
  }
);


test(
  "equivalent irrational boundary tie selects collision",
  () => {
    /*
     * Exact equivalent irrational parameter:
     *
     *   (3 - sqrt(5)) / 2
     *
     * which lies strictly inside:
     *
     *   0 < t < 1
     *
     * The second representation is the exact
     * coefficient-scaled equivalent:
     *
     *   a' = 2a
     *   b' = 2b
     *   D' = 4D
     */
    const playerParameter =
      createQuadraticLowerRootContactParameterV1({
        a:
          1n,

        b:
          -3n,

        discriminant:
          5n,
      });

    const exitParameter =
      createQuadraticLowerRootContactParameterV1({
        a:
          2n,

        b:
          -6n,

        discriminant:
          20n,
      });


    const result =
      resolveCollisionWorldExitPrecedenceV1({
        collision:
          collision({
            parameter:
              playerParameter,
          }),

        worldExit:
          worldExit({
            parameter:
              exitParameter,
          }),
      });


    assert.equal(
      result.segment_event_kind,
      COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.COLLISION
    );
  }
);


test(
  "already_outside wins against collision at exact zero",
  () => {
    const zero =
      rational(
        0n,
        1n
      );


    const result =
      resolveCollisionWorldExitPrecedenceV1({
        collision:
          collision({
            parameter:
              zero,
          }),

        worldExit:
          worldExit({
            kind:
              PROJECTILE_WORLD_EXIT_KIND_V1.ALREADY_OUTSIDE,

            parameter:
              zero,
          }),
      });


    assert.equal(
      result.segment_event_kind,
      COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.WORLD_EXIT
    );

    assert.equal(
      result.world_exit_kind,
      PROJECTILE_WORLD_EXIT_KIND_V1.ALREADY_OUTSIDE
    );
  }
);


test(
  "already_outside wins regardless of later collision parameter",
  () => {
    const result =
      resolveCollisionWorldExitPrecedenceV1({
        collision:
          collision({
            parameter:
              rational(
                3n,
                4n
              ),
          }),

        worldExit:
          worldExit({
            kind:
              PROJECTILE_WORLD_EXIT_KIND_V1.ALREADY_OUTSIDE,

            parameter:
              rational(
                0n,
                1n
              ),
          }),
      });


    assert.equal(
      result.segment_event_kind,
      COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.WORLD_EXIT
    );
  }
);


test(
  "already_outside must carry canonical zero",
  () => {
    assert.throws(
      () =>
        resolveCollisionWorldExitPrecedenceV1({
          collision:
            null,

          worldExit:
            worldExit({
              kind:
                PROJECTILE_WORLD_EXIT_KIND_V1.ALREADY_OUTSIDE,

              parameter:
                rational(
                  1n,
                  4n
                ),
            }),
        }),
      {
        code:
          "CING_ARTILLERY_COLLISION_WORLD_EXIT_PRECEDENCE_INVARIANT_V1",
      }
    );
  }
);


test(
  "terrain collision preserves terrain semantic kind",
  () => {
    const result =
      resolveCollisionWorldExitPrecedenceV1({
        collision:
          collision({
            kind:
              PLAYER_TERRAIN_COLLISION_KIND_V1.TERRAIN,

            parameter:
              rational(
                1n,
                4n
              ),
          }),

        worldExit:
          worldExit({
            parameter:
              rational(
                3n,
                4n
              ),
          }),
      });


    assert.equal(
      result.segment_event_kind,
      COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.COLLISION
    );

    assert.equal(
      result.collision_kind,
      PLAYER_TERRAIN_COLLISION_KIND_V1.TERRAIN
    );
  }
);


test(
  "result envelope is frozen and reuses winning parameter",
  () => {
    const parameter =
      rational(
        1n,
        4n
      );


    const result =
      resolveCollisionWorldExitPrecedenceV1({
        collision:
          collision({
            parameter,
          }),

        worldExit:
          worldExit({
            parameter:
              rational(
                3n,
                4n
              ),
          }),
      });


    assert.ok(
      Object.isFrozen(
        result
      )
    );

    assert.equal(
      result.contact_parameter,
      parameter
    );
  }
);


test(
  "non-canonical collision parameter fails closed",
  () => {
    assert.throws(
      () =>
        resolveCollisionWorldExitPrecedenceV1({
          collision: {
            collision_kind:
              PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER,

            contact_parameter: {
              kind:
                "rational",

              numerator:
                2n,

              denominator:
                4n,
            },
          },

          worldExit:
            null,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_COLLISION_WORLD_EXIT_PRECEDENCE_V1",
      }
    );
  }
);


test(
  "non-canonical world-exit parameter fails closed",
  () => {
    assert.throws(
      () =>
        resolveCollisionWorldExitPrecedenceV1({
          collision:
            null,

          worldExit: {
            world_exit_kind:
              PROJECTILE_WORLD_EXIT_KIND_V1.BOUNDARY_EXIT,

            contact_parameter: {
              kind:
                "rational",

              numerator:
                2n,

              denominator:
                4n,
            },
          },
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_COLLISION_WORLD_EXIT_PRECEDENCE_V1",
      }
    );
  }
);


test(
  "unknown collision kind fails closed",
  () => {
    assert.throws(
      () =>
        resolveCollisionWorldExitPrecedenceV1({
          collision: {
            collision_kind:
              "unknown",

            contact_parameter:
              rational(
                1n,
                2n
              ),
          },

          worldExit:
            null,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_COLLISION_WORLD_EXIT_PRECEDENCE_V1",
      }
    );
  }
);


test(
  "unknown world-exit kind fails closed",
  () => {
    assert.throws(
      () =>
        resolveCollisionWorldExitPrecedenceV1({
          collision:
            null,

          worldExit: {
            world_exit_kind:
              "unknown",

            contact_parameter:
              rational(
                0n,
                1n
              ),
          },
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_COLLISION_WORLD_EXIT_PRECEDENCE_V1",
      }
    );
  }
);
