"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  CONTACT_PARAMETER_KIND_V1,

  createRationalContactParameterV1,
  createQuadraticLowerRootContactParameterV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryContactParameterV1"
  );

const {
  compareContactParametersV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryContactParameterComparatorV1"
  );

const {
  PLAYER_TERRAIN_COLLISION_KIND_V1,
  PLAYER_TERRAIN_EXACT_TIE_POLICY_V1,

  resolvePlayerTerrainCollisionPrecedenceV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryPlayerTerrainCollisionPrecedenceV1"
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


test(
  "collision kind contract is immutable and explicit",
  () => {
    assert.deepEqual(
      PLAYER_TERRAIN_COLLISION_KIND_V1,
      {
        PLAYER:
          "player",

        TERRAIN:
          "terrain",
      }
    );

    assert.ok(
      Object.isFrozen(
        PLAYER_TERRAIN_COLLISION_KIND_V1
      )
    );

    assert.equal(
      PLAYER_TERRAIN_EXACT_TIE_POLICY_V1,
      "player"
    );
  }
);


test(
  "null player and null terrain produce no collision",
  () => {
    assert.equal(
      resolvePlayerTerrainCollisionPrecedenceV1({
        playerContact:
          null,

        terrainContact:
          null,
      }),
      null
    );
  }
);


test(
  "player-only contact selects player",
  () => {
    const player =
      rational(
        1n,
        3n
      );

    const result =
      resolvePlayerTerrainCollisionPrecedenceV1({
        playerContact:
          player,

        terrainContact:
          null,
      });


    assert.deepEqual(
      result,
      {
        collision_kind:
          PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER,

        contact_parameter:
          player,
      }
    );
  }
);


test(
  "terrain-only contact selects terrain",
  () => {
    const terrain =
      rational(
        2n,
        5n
      );

    const result =
      resolvePlayerTerrainCollisionPrecedenceV1({
        playerContact:
          null,

        terrainContact:
          terrain,
      });


    assert.deepEqual(
      result,
      {
        collision_kind:
          PLAYER_TERRAIN_COLLISION_KIND_V1.TERRAIN,

        contact_parameter:
          terrain,
      }
    );
  }
);


test(
  "earlier rational player contact beats later terrain contact",
  () => {
    const player =
      rational(
        1n,
        4n
      );

    const terrain =
      rational(
        1n,
        3n
      );


    assert.equal(
      compareContactParametersV1(
        player,
        terrain
      ),
      -1
    );


    const result =
      resolvePlayerTerrainCollisionPrecedenceV1({
        playerContact:
          player,

        terrainContact:
          terrain,
      });


    assert.equal(
      result.collision_kind,
      PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER
    );

    assert.strictEqual(
      result.contact_parameter,
      player
    );
  }
);


test(
  "earlier rational terrain contact beats later player contact",
  () => {
    const player =
      rational(
        3n,
        4n
      );

    const terrain =
      rational(
        2n,
        5n
      );


    assert.equal(
      compareContactParametersV1(
        terrain,
        player
      ),
      -1
    );


    const result =
      resolvePlayerTerrainCollisionPrecedenceV1({
        playerContact:
          player,

        terrainContact:
          terrain,
      });


    assert.equal(
      result.collision_kind,
      PLAYER_TERRAIN_COLLISION_KIND_V1.TERRAIN
    );

    assert.strictEqual(
      result.contact_parameter,
      terrain
    );
  }
);


test(
  "exact rational player-terrain tie selects player",
  () => {
    const player =
      rational(
        1n,
        2n
      );

    const terrain =
      rational(
        2n,
        4n
      );


    /*
     * Creator canonicalizes both to exact 1/2.
     */
    assert.deepEqual(
      player,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          2n,
      }
    );

    assert.deepEqual(
      terrain,
      player
    );


    assert.equal(
      compareContactParametersV1(
        player,
        terrain
      ),
      0
    );


    const result =
      resolvePlayerTerrainCollisionPrecedenceV1({
        playerContact:
          player,

        terrainContact:
          terrain,
      });


    assert.equal(
      result.collision_kind,
      PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER
    );

    assert.strictEqual(
      result.contact_parameter,
      player
    );
  }
);


test(
  "equivalent irrational player-terrain tie selects player",
  () => {
    /*
     * q1 =
     *
     *   (-(-8) - sqrt(32)) / (2*8)
     *
     * q2 is the same irrational root scaled by 2:
     *
     *   (-(-16) - sqrt(128)) / (2*16)
     *
     * Both are canonical irrational forms and comparator
     * must report exact equality without approximation.
     */
    const player =
      createQuadraticLowerRootContactParameterV1({
        a:
          8n,

        b:
          -8n,

        discriminant:
          32n,
      });

    const terrain =
      createQuadraticLowerRootContactParameterV1({
        a:
          16n,

        b:
          -16n,

        discriminant:
          128n,
      });


    assert.equal(
      player.kind,
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT
    );

    assert.equal(
      terrain.kind,
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT
    );


    assert.equal(
      compareContactParametersV1(
        player,
        terrain
      ),
      0
    );


    const result =
      resolvePlayerTerrainCollisionPrecedenceV1({
        playerContact:
          player,

        terrainContact:
          terrain,
      });


    assert.equal(
      result.collision_kind,
      PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER
    );

    assert.strictEqual(
      result.contact_parameter,
      player
    );
  }
);


test(
  "irrational player contact can beat rational terrain contact exactly",
  () => {
    /*
     * q =
     *   (8 - sqrt(32)) / 16
     *
     * which is below 1/4.
     */
    const player =
      createQuadraticLowerRootContactParameterV1({
        a:
          8n,

        b:
          -8n,

        discriminant:
          32n,
      });

    const terrain =
      rational(
        1n,
        4n
      );


    assert.equal(
      compareContactParametersV1(
        player,
        terrain
      ),
      -1
    );


    assert.equal(
      resolvePlayerTerrainCollisionPrecedenceV1({
        playerContact:
          player,

        terrainContact:
          terrain,
      }).collision_kind,
      PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER
    );
  }
);


test(
  "irrational terrain contact can beat rational player contact exactly",
  () => {
    const terrain =
      createQuadraticLowerRootContactParameterV1({
        a:
          8n,

        b:
          -8n,

        discriminant:
          32n,
      });

    const player =
      rational(
        1n,
        4n
      );


    assert.equal(
      compareContactParametersV1(
        terrain,
        player
      ),
      -1
    );


    assert.equal(
      resolvePlayerTerrainCollisionPrecedenceV1({
        playerContact:
          player,

        terrainContact:
          terrain,
      }).collision_kind,
      PLAYER_TERRAIN_COLLISION_KIND_V1.TERRAIN
    );
  }
);


test(
  "selection depends on semantic roles rather than argument object identity",
  () => {
    const player =
      rational(
        2n,
        5n
      );

    const terrain =
      rational(
        2n,
        5n
      );


    assert.notStrictEqual(
      player,
      terrain
    );

    assert.equal(
      compareContactParametersV1(
        player,
        terrain
      ),
      0
    );


    const result =
      resolvePlayerTerrainCollisionPrecedenceV1({
        playerContact:
          player,

        terrainContact:
          terrain,
      });


    assert.equal(
      result.collision_kind,
      PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER
    );

    assert.strictEqual(
      result.contact_parameter,
      player
    );
  }
);


test(
  "result envelope is frozen while reusing immutable winning parameter",
  () => {
    const player =
      rational(
        1n,
        5n
      );

    const terrain =
      rational(
        4n,
        5n
      );


    const result =
      resolvePlayerTerrainCollisionPrecedenceV1({
        playerContact:
          player,

        terrainContact:
          terrain,
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

    assert.strictEqual(
      result.contact_parameter,
      player
    );
  }
);


test(
  "non-canonical player contact fails closed",
  () => {
    assert.throws(
      () =>
        resolvePlayerTerrainCollisionPrecedenceV1({
          playerContact: {
            kind:
              CONTACT_PARAMETER_KIND_V1.RATIONAL,

            numerator:
              2n,

            denominator:
              4n,
          },

          terrainContact:
            null,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_PLAYER_TERRAIN_COLLISION_PRECEDENCE_V1",
      }
    );
  }
);


test(
  "non-canonical terrain contact fails closed",
  () => {
    assert.throws(
      () =>
        resolvePlayerTerrainCollisionPrecedenceV1({
          playerContact:
            null,

          terrainContact: {
            kind:
              CONTACT_PARAMETER_KIND_V1.RATIONAL,

            numerator:
              3n,

            denominator:
              6n,
          },
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_PLAYER_TERRAIN_COLLISION_PRECEDENCE_V1",
      }
    );
  }
);


test(
  "unknown player parameter shape fails closed",
  () => {
    assert.throws(
      () =>
        resolvePlayerTerrainCollisionPrecedenceV1({
          playerContact: {
            kind:
              "unknown",
          },

          terrainContact:
            null,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_PLAYER_TERRAIN_COLLISION_PRECEDENCE_V1",
      }
    );
  }
);


test(
  "unknown terrain parameter shape fails closed",
  () => {
    assert.throws(
      () =>
        resolvePlayerTerrainCollisionPrecedenceV1({
          playerContact:
            null,

          terrainContact: {
            kind:
              "unknown",
          },
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_PLAYER_TERRAIN_COLLISION_PRECEDENCE_V1",
      }
    );
  }
);
