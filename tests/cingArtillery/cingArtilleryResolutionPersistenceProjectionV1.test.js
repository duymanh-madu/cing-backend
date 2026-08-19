"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  RESOLUTION_PERSISTENCE_OUTCOME_V1,
  projectResolutionPersistenceV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryResolutionPersistenceProjectionV1"
  );

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


const TARGET =
  "70000000-0000-4000-8000-000000000001";


function segment() {
  return Object.freeze({
    start_x_scaled:
      1000n,

    start_y_scaled:
      2000n,

    end_x_scaled:
      1300n,

    end_y_scaled:
      2400n,

    delta_x_scaled:
      300n,

    delta_y_scaled:
      400n,
  });
}


function rationalImpact() {
  return createSegmentContactPointV1({
    trajectorySegment:
      segment(),

    contactParameter:
      createRationalContactParameterV1({
        numerator:
          1n,

        denominator:
          2n,
      }),
  });
}


function quadraticImpact() {
  return createSegmentContactPointV1({
    trajectorySegment:
      segment(),

    contactParameter:
      createQuadraticLowerRootContactParameterV1({
        a:
          2n,

        b:
          -5n,

        discriminant:
          5n,
      }),
  });
}


function numericImpact() {
  return Object.freeze({
    projection_version:
      1,

    impact_x:
      "1.15",

    impact_y:
      "2.2",
  });
}


function collisionDamage({
  outcome =
    "player_hit",

  exactImpact =
    rationalImpact(),

  targetAccountId =
    TARGET,

  damage =
    300n,
} = {}) {
  return Object.freeze({
    outcome,

    exact_impact:
      exactImpact,

    numeric_impact:
      numericImpact(),

    target_account_id:
      targetAccountId,

    damage,
  });
}


function noImpactDamage(
  outcome
) {
  return Object.freeze({
    outcome,

    exact_impact:
      null,

    numeric_impact:
      null,

    target_account_id:
      null,

    damage:
      0n,
  });
}


test(
  "persistence outcomes are explicit and immutable",
  () => {
    assert.ok(
      Object.isFrozen(
        RESOLUTION_PERSISTENCE_OUTCOME_V1
      )
    );

    assert.deepEqual(
      Object.values(
        RESOLUTION_PERSISTENCE_OUTCOME_V1
      ),
      [
        "player_hit",
        "terrain_hit",
        "out_of_bounds",
        "flight_horizon_exhausted",
      ]
    );
  }
);


test(
  "player hit projects exact rational impact and BigInt damage",
  () => {
    const result =
      projectResolutionPersistenceV1({
        canonicalShotDamage:
          collisionDamage(),

        physicsVersion:
          1,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      result.physics_version,
      1
    );

    assert.equal(
      result.outcome,
      "player_hit"
    );

    assert.equal(
      result.impact_exact_version,
      1
    );

    assert.equal(
      result.impact_physics_fixed_scale,
      "1000"
    );

    assert.equal(
      result.impact_start_x_scaled,
      "1000"
    );

    assert.equal(
      result.impact_start_y_scaled,
      "2000"
    );

    assert.equal(
      result.impact_delta_x_scaled,
      "300"
    );

    assert.equal(
      result.impact_delta_y_scaled,
      "400"
    );

    assert.equal(
      result.impact_contact_kind,
      "rational"
    );

    assert.equal(
      result.impact_contact_numerator,
      "1"
    );

    assert.equal(
      result.impact_contact_denominator,
      "2"
    );

    assert.equal(
      result.impact_contact_a,
      null
    );

    assert.equal(
      result.impact_projection_version,
      1
    );

    assert.equal(
      result.impact_x,
      "1.15"
    );

    assert.equal(
      result.impact_y,
      "2.2"
    );

    assert.equal(
      result.target_account_id,
      TARGET
    );

    assert.equal(
      result.damage,
      "300"
    );
  }
);


test(
  "quadratic exact impact preserves symbolic coefficients",
  () => {
    const result =
      projectResolutionPersistenceV1({
        canonicalShotDamage:
          collisionDamage({
            exactImpact:
              quadraticImpact(),
          }),

        physicsVersion:
          1,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      result.impact_contact_kind,
      "quadratic_lower_root"
    );

    assert.equal(
      result.impact_contact_numerator,
      null
    );

    assert.equal(
      result.impact_contact_denominator,
      null
    );

    assert.equal(
      result.impact_contact_a,
      "2"
    );

    assert.equal(
      result.impact_contact_b,
      "-5"
    );

    assert.equal(
      result.impact_contact_discriminant,
      "5"
    );
  }
);


test(
  "terrain miss projects collision impact with null target and zero damage",
  () => {
    const result =
      projectResolutionPersistenceV1({
        canonicalShotDamage:
          collisionDamage({
            outcome:
              "terrain_hit",

            targetAccountId:
              null,

            damage:
              0n,
          }),

        physicsVersion:
          1,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      result.outcome,
      "terrain_hit"
    );

    assert.equal(
      result.target_account_id,
      null
    );

    assert.equal(
      result.damage,
      "0"
    );

    assert.equal(
      result.impact_exact_version,
      1
    );

    assert.equal(
      result.impact_projection_version,
      1
    );
  }
);


test(
  "terrain blast preserves positive damage",
  () => {
    const result =
      projectResolutionPersistenceV1({
        canonicalShotDamage:
          collisionDamage({
            outcome:
              "terrain_hit",

            damage:
              150n,
          }),

        physicsVersion:
          1,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      result.target_account_id,
      TARGET
    );

    assert.equal(
      result.damage,
      "150"
    );
  }
);


for (
  const outcome
  of [
    "out_of_bounds",
    "flight_horizon_exhausted",
  ]
) {
  test(
    `${outcome} projects all impact fields null`,
    () => {
      const result =
        projectResolutionPersistenceV1({
          canonicalShotDamage:
            noImpactDamage(
              outcome
            ),

          physicsVersion:
            1,
        });

      assert.equal(
        result.impact_exact_version,
        null
      );

      assert.equal(
        result.impact_physics_fixed_scale,
        null
      );

      assert.equal(
        result.impact_start_x_scaled,
        null
      );

      assert.equal(
        result.impact_contact_kind,
        null
      );

      assert.equal(
        result.impact_projection_version,
        null
      );

      assert.equal(
        result.impact_x,
        null
      );

      assert.equal(
        result.impact_y,
        null
      );

      assert.equal(
        result.damage,
        "0"
      );
    }
  );
}


test(
  "BigInt scalar serialization is plain canonical base ten",
  () => {
    const result =
      projectResolutionPersistenceV1({
        canonicalShotDamage:
          collisionDamage({
            damage:
              123456789012345678901234567890n,
          }),

        physicsVersion:
          1,

        physicsFixedScale:
          9007199254740991,
      });

    assert.equal(
      result.damage,
      "123456789012345678901234567890"
    );

    assert.equal(
      result.impact_physics_fixed_scale,
      "9007199254740991"
    );
  }
);


test(
  "collision requires projection version one",
  () => {
    const canonical =
      {
        ...collisionDamage(),

        numeric_impact: {
          projection_version:
            2,

          impact_x:
            "1",

          impact_y:
            "2",
        },
      };

    assert.throws(
      () =>
        projectResolutionPersistenceV1({
          canonicalShotDamage:
            canonical,

          physicsVersion:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_RESOLUTION_PERSISTENCE_NUMERIC_PROJECTION_VERSION_INVALID_V1",
      }
    );
  }
);


test(
  "noncanonical decimal projection strings fail closed",
  () => {
    const invalidValues = [
      "01",
      "+1",
      "1e3",
      "-1",
      ".5",
      "1.",
      "",
    ];

    for (
      const impact_x
      of invalidValues
    ) {
      assert.throws(
        () =>
          projectResolutionPersistenceV1({
            canonicalShotDamage: {
              ...collisionDamage(),

              numeric_impact: {
                projection_version:
                  1,

                impact_x,

                impact_y:
                  "2",
              },
            },

            physicsVersion:
              1,

            physicsFixedScale:
              1000,
          })
      );
    }
  }
);


test(
  "no-impact outcome rejects stale scale",
  () => {
    assert.throws(
      () =>
        projectResolutionPersistenceV1({
          canonicalShotDamage:
            noImpactDamage(
              "out_of_bounds"
            ),

          physicsVersion:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_RESOLUTION_PERSISTENCE_UNEXPECTED_SCALE_V1",
      }
    );
  }
);


test(
  "durable outcome target damage shape is revalidated",
  () => {
    assert.throws(
      () =>
        projectResolutionPersistenceV1({
          canonicalShotDamage:
            collisionDamage({
              outcome:
                "terrain_hit",

              targetAccountId:
                null,

              damage:
                1n,
            }),

          physicsVersion:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_RESOLUTION_PERSISTENCE_OUTCOME_SHAPE_INVALID_V1",
      }
    );

    assert.throws(
      () =>
        projectResolutionPersistenceV1({
          canonicalShotDamage: {
            ...noImpactDamage(
              "flight_horizon_exhausted"
            ),

            damage:
              1n,
          },

          physicsVersion:
            1,
        }),
      {
        code:
          "CING_ARTILLERY_RESOLUTION_PERSISTENCE_OUTCOME_SHAPE_INVALID_V1",
      }
    );
  }
);


test(
  "projection output is immutable and contains no BigInt",
  () => {
    const result =
      projectResolutionPersistenceV1({
        canonicalShotDamage:
          collisionDamage(),

        physicsVersion:
          1,

        physicsFixedScale:
          1000,
      });

    assert.ok(
      Object.isFrozen(
        result
      )
    );

    for (
      const value
      of Object.values(
        result
      )
    ) {
      assert.notEqual(
        typeof value,
        "bigint"
      );
    }
  }
);
