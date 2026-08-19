"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  materializeCanonicalShotDamageV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryCanonicalShotDamageMaterializationV1"
  );


const OPPONENT_ACCOUNT_ID =
  "70000000-0000-4000-8000-000000000001";

const OPPONENT_SESSION_ID =
  "80000000-0000-4000-8000-000000000001";


function collisionShot(
  outcome
) {
  return Object.freeze({
    outcome,

    exact_impact:
      Object.freeze({
        canonical:
          true,
      }),

    numeric_impact:
      Object.freeze({
        projection_version:
          1,

        impact_x:
          "10.25",

        impact_y:
          "20.5",
      }),
  });
}


function noImpactShot(
  outcome
) {
  return Object.freeze({
    outcome,

    exact_impact:
      null,

    numeric_impact:
      null,
  });
}


function target(
  targetAccountId
) {
  return Object.freeze({
    target_account_id:
      targetAccountId,
  });
}


function opponentBinding() {
  return Object.freeze({
    opponent_account_id:
      OPPONENT_ACCOUNT_ID,

    opponent_session_id:
      OPPONENT_SESSION_ID,
  });
}


function statBinding(
  overrides = {}
) {
  return Object.freeze({
    shooter_slot:
      "player_one",

    shooter_account_id:
      "50000000-0000-4000-8000-000000000001",

    shooter_session_id:
      "60000000-0000-4000-8000-000000000001",

    attacker_attack:
      100,

    opponent_slot:
      "player_two",

    opponent_account_id:
      OPPONENT_ACCOUNT_ID,

    opponent_session_id:
      OPPONENT_SESSION_ID,

    defender_defense:
      100,

    ...overrides,
  });
}


function damageRules() {
  return Object.freeze({
    base_damage:
      Object.freeze({
        numerator:
          300n,

        denominator:
          1n,
      }),

    blast_min_damage_ratio:
      Object.freeze({
        numerator:
          1n,

        denominator:
          10n,
      }),

    damage_formula_version:
      1,

    damage_rounding:
      "floor",

    self_damage_enabled:
      false,
  });
}


function blastRadius() {
  return Object.freeze({
    blast_radius:
      100,

    physics_fixed_scale:
      1,

    blast_radius_scaled:
      100n,
  });
}


function baseArgs(
  overrides = {}
) {
  return {
    opponentBinding:
      opponentBinding(),

    damageRules:
      damageRules(),

    statBinding:
      statBinding(),

    blastRadiusNumeric:
      blastRadius(),

    ...overrides,
  };
}


test(
  "player hit materializes canonical direct damage",
  () => {
    const shot =
      collisionShot(
        "player_hit"
      );

    const result =
      materializeCanonicalShotDamageV1(
        baseArgs({
          shotTrajectoryResult:
            shot,

          canonicalTarget:
            target(
              OPPONENT_ACCOUNT_ID
            ),
        })
      );

    assert.equal(
      result.outcome,
      "player_hit"
    );

    assert.equal(
      result.target_account_id,
      OPPONENT_ACCOUNT_ID
    );

    assert.equal(
      result.damage,
      300n
    );

    assert.equal(
      result.damage_mode,
      "direct"
    );

    assert.equal(
      result.blast_distance_floor_scaled,
      null
    );

    assert.equal(
      result.exact_impact,
      shot.exact_impact
    );

    assert.equal(
      result.numeric_impact,
      shot.numeric_impact
    );
  }
);


test(
  "terrain hit with affected opponent materializes blast damage",
  () => {
    const result =
      materializeCanonicalShotDamageV1(
        baseArgs({
          shotTrajectoryResult:
            collisionShot(
              "terrain_hit"
            ),

          canonicalTarget:
            target(
              OPPONENT_ACCOUNT_ID
            ),

          blastTargetEligibility:
            Object.freeze({
              opponent_affected:
                true,
            }),

          exactBlastDistanceFloor:
            Object.freeze({
              distance_floor_scaled:
                50n,
            }),
        })
      );

    assert.equal(
      result.target_account_id,
      OPPONENT_ACCOUNT_ID
    );

    assert.equal(
      result.damage,
      150n
    );

    assert.equal(
      result.damage_mode,
      "blast"
    );

    assert.equal(
      result.blast_distance_floor_scaled,
      50n
    );
  }
);


test(
  "terrain hit without affected opponent materializes zero damage",
  () => {
    const result =
      materializeCanonicalShotDamageV1(
        baseArgs({
          shotTrajectoryResult:
            collisionShot(
              "terrain_hit"
            ),

          canonicalTarget:
            target(
              null
            ),

          blastTargetEligibility:
            Object.freeze({
              opponent_affected:
                false,
            }),
        })
      );

    assert.equal(
      result.target_account_id,
      null
    );

    assert.equal(
      result.damage,
      0n
    );

    assert.equal(
      result.damage_mode,
      null
    );

    assert.equal(
      result.blast_distance_floor_scaled,
      null
    );
  }
);


test(
  "out of bounds materializes canonical zero-damage no-impact payload",
  () => {
    const result =
      materializeCanonicalShotDamageV1(
        baseArgs({
          shotTrajectoryResult:
            noImpactShot(
              "out_of_bounds"
            ),

          canonicalTarget:
            target(
              null
            ),
        })
      );

    assert.equal(
      result.outcome,
      "out_of_bounds"
    );

    assert.equal(
      result.exact_impact,
      null
    );

    assert.equal(
      result.numeric_impact,
      null
    );

    assert.equal(
      result.target_account_id,
      null
    );

    assert.equal(
      result.damage,
      0n
    );
  }
);


test(
  "flight horizon exhausted materializes canonical zero-damage no-impact payload",
  () => {
    const result =
      materializeCanonicalShotDamageV1(
        baseArgs({
          shotTrajectoryResult:
            noImpactShot(
              "flight_horizon_exhausted"
            ),

          canonicalTarget:
            target(
              null
            ),
        })
      );

    assert.equal(
      result.outcome,
      "flight_horizon_exhausted"
    );

    assert.equal(
      result.target_account_id,
      null
    );

    assert.equal(
      result.damage,
      0n
    );

    assert.equal(
      result.damage_mode,
      null
    );
  }
);


test(
  "player hit cannot target anyone except canonical opponent",
  () => {
    assert.throws(
      () =>
        materializeCanonicalShotDamageV1(
          baseArgs({
            shotTrajectoryResult:
              collisionShot(
                "player_hit"
              ),

            canonicalTarget:
              target(
                "90000000-0000-4000-8000-000000000001"
              ),
          })
        ),
      {
        code:
          "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_TARGET_MISMATCH_V1",
      }
    );
  }
);


test(
  "affected terrain hit requires canonical blast distance",
  () => {
    assert.throws(
      () =>
        materializeCanonicalShotDamageV1(
          baseArgs({
            shotTrajectoryResult:
              collisionShot(
                "terrain_hit"
              ),

            canonicalTarget:
              target(
                OPPONENT_ACCOUNT_ID
              ),

            blastTargetEligibility:
              Object.freeze({
                opponent_affected:
                  true,
              }),
          })
        )
    );
  }
);


test(
  "unaffected terrain hit forbids blast distance",
  () => {
    assert.throws(
      () =>
        materializeCanonicalShotDamageV1(
          baseArgs({
            shotTrajectoryResult:
              collisionShot(
                "terrain_hit"
              ),

            canonicalTarget:
              target(
                null
              ),

            blastTargetEligibility:
              Object.freeze({
                opponent_affected:
                  false,
              }),

            exactBlastDistanceFloor:
              Object.freeze({
                distance_floor_scaled:
                  1n,
              }),
          })
        ),
      {
        code:
          "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_UNEXPECTED_BLAST_DISTANCE_V1",
      }
    );
  }
);


test(
  "blast distance cannot exceed canonical blast radius",
  () => {
    assert.throws(
      () =>
        materializeCanonicalShotDamageV1(
          baseArgs({
            shotTrajectoryResult:
              collisionShot(
                "terrain_hit"
              ),

            canonicalTarget:
              target(
                OPPONENT_ACCOUNT_ID
              ),

            blastTargetEligibility:
              Object.freeze({
                opponent_affected:
                  true,
              }),

            exactBlastDistanceFloor:
              Object.freeze({
                distance_floor_scaled:
                  101n,
              }),
          })
        ),
      {
        code:
          "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_BLAST_DISTANCE_INVALID_V1",
      }
    );
  }
);


test(
  "no-impact outcomes reject impact data",
  () => {
    assert.throws(
      () =>
        materializeCanonicalShotDamageV1(
          baseArgs({
            shotTrajectoryResult:
              collisionShot(
                "out_of_bounds"
              ),

            canonicalTarget:
              target(
                null
              ),
          })
        ),
      {
        code:
          "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_UNEXPECTED_IMPACT_V1",
      }
    );
  }
);


test(
  "collision outcomes require projection v1 strings",
  () => {
    assert.throws(
      () =>
        materializeCanonicalShotDamageV1(
          baseArgs({
            shotTrajectoryResult: {
              outcome:
                "player_hit",

              exact_impact: {
                canonical:
                  true,
              },

              numeric_impact: {
                projection_version:
                  2,

                impact_x:
                  "10",

                impact_y:
                  "20",
              },
            },

            canonicalTarget:
              target(
                OPPONENT_ACCOUNT_ID
              ),
          })
        ),
      {
        code:
          "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_NUMERIC_IMPACT_INVALID_V1",
      }
    );
  }
);


test(
  "stat identity cannot diverge from canonical opponent binding",
  () => {
    assert.throws(
      () =>
        materializeCanonicalShotDamageV1(
          baseArgs({
            shotTrajectoryResult:
              collisionShot(
                "player_hit"
              ),

            canonicalTarget:
              target(
                OPPONENT_ACCOUNT_ID
              ),

            statBinding:
              statBinding({
                opponent_account_id:
                  "90000000-0000-4000-8000-000000000001",
              }),
          })
        ),
      {
        code:
          "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_STAT_IDENTITY_MISMATCH_V1",
      }
    );
  }
);


test(
  "damage remains BigInt and result is immutable",
  () => {
    const result =
      materializeCanonicalShotDamageV1(
        baseArgs({
          shotTrajectoryResult:
            collisionShot(
              "player_hit"
            ),

          canonicalTarget:
            target(
              OPPONENT_ACCOUNT_ID
            ),
        })
      );

    assert.equal(
      typeof result.damage,
      "bigint"
    );

    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);
