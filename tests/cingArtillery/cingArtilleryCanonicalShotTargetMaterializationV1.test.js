"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  materializeCanonicalShotTargetV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryCanonicalShotTargetMaterializationV1"
  );


const OPPONENT_ACCOUNT_ID =
  "22222222-2222-4222-8222-222222222222";

const OPPONENT_SESSION_ID =
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";


function opponentBinding() {
  return Object.freeze({
    shooter_slot:
      "player_one",

    shooter_account_id:
      "11111111-1111-4111-8111-111111111111",

    shooter_session_id:
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",

    opponent_slot:
      "player_two",

    opponent_account_id:
      OPPONENT_ACCOUNT_ID,

    opponent_session_id:
      OPPONENT_SESSION_ID,

    opponent_spawn_x:
      90,

    opponent_spawn_y:
      30,

    opponent_collider:
      Object.freeze({
        center_x_scaled:
          90000n,

        center_y_scaled:
          18000n,

        radius_scaled:
          5000n,
      }),
  });
}


function shot(
  outcome
) {
  return Object.freeze({
    outcome,
  });
}


test(
  "player_hit materializes canonical opponent account",
  () => {
    const result =
      materializeCanonicalShotTargetV1({
        shotTrajectoryResult:
          shot(
            "player_hit"
          ),

        opponentBinding:
          opponentBinding(),
      });


    assert.deepEqual(
      result,
      {
        target_account_id:
          OPPONENT_ACCOUNT_ID,
      }
    );
  }
);


test(
  "terrain_hit with affected opponent materializes canonical opponent",
  () => {
    const result =
      materializeCanonicalShotTargetV1({
        shotTrajectoryResult:
          shot(
            "terrain_hit"
          ),

        opponentBinding:
          opponentBinding(),

        blastTargetEligibility: {
          opponent_affected:
            true,
        },
      });


    assert.equal(
      result.target_account_id,
      OPPONENT_ACCOUNT_ID
    );
  }
);


test(
  "terrain_hit outside blast materializes null target",
  () => {
    const result =
      materializeCanonicalShotTargetV1({
        shotTrajectoryResult:
          shot(
            "terrain_hit"
          ),

        opponentBinding:
          opponentBinding(),

        blastTargetEligibility: {
          opponent_affected:
            false,
        },
      });


    assert.equal(
      result.target_account_id,
      null
    );
  }
);


test(
  "out_of_bounds has no target",
  () => {
    const result =
      materializeCanonicalShotTargetV1({
        shotTrajectoryResult:
          shot(
            "out_of_bounds"
          ),

        opponentBinding:
          opponentBinding(),
      });


    assert.deepEqual(
      result,
      {
        target_account_id:
          null,
      }
    );
  }
);


test(
  "flight_horizon_exhausted has no target",
  () => {
    const result =
      materializeCanonicalShotTargetV1({
        shotTrajectoryResult:
          shot(
            "flight_horizon_exhausted"
          ),

        opponentBinding:
          opponentBinding(),
      });


    assert.deepEqual(
      result,
      {
        target_account_id:
          null,
      }
    );
  }
);


test(
  "terrain_hit requires explicit blast eligibility",
  () => {
    assert.throws(
      () =>
        materializeCanonicalShotTargetV1({
          shotTrajectoryResult:
            shot(
              "terrain_hit"
            ),

          opponentBinding:
            opponentBinding(),
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_CANONICAL_SHOT_TARGET_MATERIALIZATION_V1",
      }
    );
  }
);


test(
  "terrain eligibility must expose canonical boolean",
  () => {
    for (
      const opponentAffected
      of [
        null,
        0,
        1,
        "true",
        "false",
      ]
    ) {
      assert.throws(
        () =>
          materializeCanonicalShotTargetV1({
            shotTrajectoryResult:
              shot(
                "terrain_hit"
              ),

            opponentBinding:
              opponentBinding(),

            blastTargetEligibility: {
              opponent_affected:
                opponentAffected,
            },
          }),
        {
          code:
            "CING_ARTILLERY_CANONICAL_SHOT_TARGET_BLAST_ELIGIBILITY_INVALID_V1",
        }
      );
    }
  }
);


test(
  "non-terrain outcomes reject stale blast eligibility",
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
          materializeCanonicalShotTargetV1({
            shotTrajectoryResult:
              shot(
                outcome
              ),

            opponentBinding:
              opponentBinding(),

            blastTargetEligibility: {
              opponent_affected:
                true,
            },
          }),
        {
          code:
            "CING_ARTILLERY_CANONICAL_SHOT_TARGET_UNEXPECTED_BLAST_ELIGIBILITY_V1",
        }
      );
    }
  }
);


test(
  "unknown shot outcome fails closed",
  () => {
    assert.throws(
      () =>
        materializeCanonicalShotTargetV1({
          shotTrajectoryResult:
            shot(
              "mystery"
            ),

          opponentBinding:
            opponentBinding(),
        }),
      {
        code:
          "CING_ARTILLERY_CANONICAL_SHOT_TARGET_OUTCOME_UNSUPPORTED_V1",
      }
    );
  }
);


test(
  "canonical opponent account and session identity are required",
  () => {
    assert.throws(
      () =>
        materializeCanonicalShotTargetV1({
          shotTrajectoryResult:
            shot(
              "player_hit"
            ),

          opponentBinding: {
            opponent_account_id:
              "",

            opponent_session_id:
              OPPONENT_SESSION_ID,
          },
        })
    );


    assert.throws(
      () =>
        materializeCanonicalShotTargetV1({
          shotTrajectoryResult:
            shot(
              "player_hit"
            ),

          opponentBinding: {
            opponent_account_id:
              OPPONENT_ACCOUNT_ID,

            opponent_session_id:
              "",
          },
        })
    );
  }
);


test(
  "materialization never reads collider or impact geometry",
  () => {
    const result =
      materializeCanonicalShotTargetV1({
        shotTrajectoryResult: {
          outcome:
            "player_hit",

          exact_impact:
            "malformed-and-irrelevant",

          numeric_impact:
            "malformed-and-irrelevant",
        },

        opponentBinding: {
          opponent_account_id:
            OPPONENT_ACCOUNT_ID,

          opponent_session_id:
            OPPONENT_SESSION_ID,

          opponent_collider:
            "malformed-and-irrelevant",
        },
      });


    assert.equal(
      result.target_account_id,
      OPPONENT_ACCOUNT_ID
    );
  }
);


test(
  "materialized result is immutable",
  () => {
    const result =
      materializeCanonicalShotTargetV1({
        shotTrajectoryResult:
          shot(
            "player_hit"
          ),

        opponentBinding:
          opponentBinding(),
      });


    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);
