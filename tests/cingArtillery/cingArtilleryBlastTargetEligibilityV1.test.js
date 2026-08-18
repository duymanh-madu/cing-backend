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
  createSegmentContactPointV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySegmentContactPointV1"
  );

const {
  normalizeBlastRadiusNumericV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryBlastRadiusNumericV1"
  );

const {
  classifyBlastTargetEligibilityV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryBlastTargetEligibilityV1"
  );


function exactPoint({
  startX,
  startY,
  endX,
  endY,
  parameter,
}) {
  return createSegmentContactPointV1({
    trajectorySegment: {
      start_x_scaled:
        startX,

      start_y_scaled:
        startY,

      end_x_scaled:
        endX,

      end_y_scaled:
        endY,
    },

    contactParameter:
      parameter,
  });
}


function rational(
  numerator,
  denominator
) {
  return createRationalContactParameterV1({
    numerator,
    denominator,
  });
}


function irrationalV1() {
  return createQuadraticLowerRootContactParameterV1({
    a:
      1n,

    b:
      -2n,

    discriminant:
      2n,
  });
}


function terrainHit(
  exactImpact
) {
  return Object.freeze({
    outcome:
      "terrain_hit",

    exact_impact:
      exactImpact,

    numeric_impact: {
      projection_version:
        1,

      impact_x:
        "999999999.999999999999",

      impact_y:
        "-999999999.999999999999",
    },
  });
}


function opponentCollider({
  centerX =
    0n,

  centerY =
    0n,

  radius =
    999999999n,
} = {}) {
  return Object.freeze({
    spawn_x_scaled:
      centerX,

    spawn_y_scaled:
      centerY,

    center_x_scaled:
      centerX,

    center_y_scaled:
      centerY,

    radius_scaled:
      radius,
  });
}


test(
  "rational terrain impact inside blast radius affects opponent",
  () => {
    const impact =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          6000n,

        endY:
          8000n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    const result =
      classifyBlastTargetEligibilityV1({
        shotTrajectoryResult:
          terrainHit(
            impact
          ),

        opponentCollider:
          opponentCollider(),

        blastRadiusScaled:
          6000n,
      });


    assert.deepEqual(
      result,
      {
        opponent_affected:
          true,
      }
    );
  }
);


test(
  "rational terrain impact outside blast radius does not affect opponent",
  () => {
    const impact =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          6000n,

        endY:
          8000n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    const result =
      classifyBlastTargetEligibilityV1({
        shotTrajectoryResult:
          terrainHit(
            impact
          ),

        opponentCollider:
          opponentCollider(),

        blastRadiusScaled:
          4000n,
      });


    assert.equal(
      result.opponent_affected,
      false
    );
  }
);


test(
  "exact blast tangency affects opponent",
  () => {
    const impact =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          6000n,

        endY:
          8000n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    /*
     * exact impact = (3000, 4000)
     * exact distance from origin = 5000
     */
    const result =
      classifyBlastTargetEligibilityV1({
        shotTrajectoryResult:
          terrainHit(
            impact
          ),

        opponentCollider:
          opponentCollider(),

        blastRadiusScaled:
          5000n,
      });


    assert.equal(
      result.opponent_affected,
      true
    );
  }
);


test(
  "irrational exact impact eligibility remains symbolic and exact",
  () => {
    const impact =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          10000n,

        endY:
          0n,

        parameter:
          irrationalV1(),
      });


    const inside =
      classifyBlastTargetEligibilityV1({
        shotTrajectoryResult:
          terrainHit(
            impact
          ),

        opponentCollider:
          opponentCollider(),

        blastRadiusScaled:
          3000n,
      });


    const outside =
      classifyBlastTargetEligibilityV1({
        shotTrajectoryResult:
          terrainHit(
            impact
          ),

        opponentCollider:
          opponentCollider(),

        blastRadiusScaled:
          2000n,
      });


    assert.equal(
      inside.opponent_affected,
      true
    );

    assert.equal(
      outside.opponent_affected,
      false
    );
  }
);


test(
  "compatibility numeric impact cannot affect blast eligibility",
  () => {
    const impact =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          1000n,

        endY:
          0n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    const shot =
      terrainHit(
        impact
      );


    const result =
      classifyBlastTargetEligibilityV1({
        shotTrajectoryResult:
          {
            ...shot,

            numeric_impact: {
              projection_version:
                1,

              impact_x:
                "999999999999999999999",

              impact_y:
                "999999999999999999999",
            },
          },

        opponentCollider:
          opponentCollider(),

        blastRadiusScaled:
          600n,
      });


    assert.equal(
      result.opponent_affected,
      true
    );
  }
);


test(
  "opponent collider radius is not added to blast radius",
  () => {
    const impact =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          10000n,

        endY:
          0n,

        parameter:
          rational(
            1n,
            1n
          ),
      });


    const result =
      classifyBlastTargetEligibilityV1({
        shotTrajectoryResult:
          terrainHit(
            impact
          ),

        opponentCollider:
          opponentCollider({
            centerX:
              0n,

            centerY:
              0n,

            radius:
              1000000000n,
          }),

        blastRadiusScaled:
          9999n,
      });


    assert.equal(
      result.opponent_affected,
      false
    );
  }
);


test(
  "canonical blast radius numeric output composes directly",
  () => {
    const numeric =
      normalizeBlastRadiusNumericV1({
        blastRadius:
          5,

        physicsFixedScale:
          1000,
      });


    const impact =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          6000n,

        endY:
          8000n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    const result =
      classifyBlastTargetEligibilityV1({
        shotTrajectoryResult:
          terrainHit(
            impact
          ),

        opponentCollider:
          opponentCollider(),

        blastRadiusScaled:
          numeric.blast_radius_scaled,
      });


    assert.equal(
      result.opponent_affected,
      true
    );
  }
);


test(
  "non-terrain outcomes cannot invoke blast target eligibility",
  () => {
    for (
      const outcome
      of [
        "player_hit",
        "out_of_bounds",
        "flight_horizon_exhausted",
      ]
    ) {
      assert.throws(
        () =>
          classifyBlastTargetEligibilityV1({
            shotTrajectoryResult: {
              outcome,

              exact_impact:
                null,
            },

            opponentCollider:
              opponentCollider(),

            blastRadiusScaled:
              5000n,
          }),
        {
          code:
            "CING_ARTILLERY_BLAST_TARGET_ELIGIBILITY_REQUIRES_TERRAIN_HIT_V1",
        }
      );
    }
  }
);


test(
  "terrain hit without exact impact fails closed",
  () => {
    assert.throws(
      () =>
        classifyBlastTargetEligibilityV1({
          shotTrajectoryResult: {
            outcome:
              "terrain_hit",

            exact_impact:
              null,
          },

          opponentCollider:
            opponentCollider(),

          blastRadiusScaled:
            5000n,
        }),
      {
        code:
          "CING_ARTILLERY_BLAST_TARGET_ELIGIBILITY_EXACT_IMPACT_MISSING_V1",
      }
    );
  }
);


test(
  "opponent center and blast radius must remain exact BigInt geometry",
  () => {
    const impact =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          1000n,

        endY:
          0n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    assert.throws(
      () =>
        classifyBlastTargetEligibilityV1({
          shotTrajectoryResult:
            terrainHit(
              impact
            ),

          opponentCollider: {
            center_x_scaled:
              0,

            center_y_scaled:
              0n,
          },

          blastRadiusScaled:
            5000n,
        })
    );


    assert.throws(
      () =>
        classifyBlastTargetEligibilityV1({
          shotTrajectoryResult:
            terrainHit(
              impact
            ),

          opponentCollider:
            opponentCollider(),

          blastRadiusScaled:
            0n,
        })
    );
  }
);


test(
  "eligibility result is immutable",
  () => {
    const impact =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          1000n,

        endY:
          0n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    const result =
      classifyBlastTargetEligibilityV1({
        shotTrajectoryResult:
          terrainHit(
            impact
          ),

        opponentCollider:
          opponentCollider(),

        blastRadiusScaled:
          5000n,
      });


    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);
