"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");


const repositoryPath =
  path.join(
    process.cwd(),
    "services/games/cingArtillery/repositories/cingArtilleryShotExecutionRepository.js"
  );

const processorPath =
  path.join(
    process.cwd(),
    "services/games/cingArtillery/services/cingArtilleryShotExecutionProcessorV1.js"
  );


test(
  "shot execution repository exposes mutable context and frozen 21-param settlement RPCs",
  () => {
    const source =
      fs.readFileSync(
        repositoryPath,
        "utf8"
      );

    assert.match(
      source,
      /cing_artillery_materialize_shot_execution_context_atomic/u
    );

    assert.match(
      source,
      /cing_artillery_commit_resolution_fenced_atomic/u
    );

    const settlementParams = [
      "p_execution_id",
      "p_claim_token",
      "p_physics_version",
      "p_outcome",
      "p_impact_exact_version",
      "p_impact_physics_fixed_scale",
      "p_impact_start_x_scaled",
      "p_impact_start_y_scaled",
      "p_impact_delta_x_scaled",
      "p_impact_delta_y_scaled",
      "p_impact_contact_kind",
      "p_impact_contact_numerator",
      "p_impact_contact_denominator",
      "p_impact_contact_a",
      "p_impact_contact_b",
      "p_impact_contact_discriminant",
      "p_impact_projection_version",
      "p_impact_x",
      "p_impact_y",
      "p_target_account_id",
      "p_damage",
    ];

    for (
      const parameter
      of settlementParams
    ) {
      assert.match(
        source,
        new RegExp(
          `\\b${parameter}\\b`,
          "u"
        )
      );
    }

    assert.equal(
      settlementParams.length,
      21
    );
  }
);


test(
  "processor uses mutable execution geometry and never immutable combat-world spawn authority",
  () => {
    const source =
      fs.readFileSync(
        processorPath,
        "utf8"
      );

    assert.match(
      source,
      /shooter_position_x/u
    );

    assert.match(
      source,
      /shooter_position_y/u
    );

    assert.match(
      source,
      /opponent_position_x/u
    );

    assert.match(
      source,
      /opponent_position_y/u
    );

    assert.match(
      source,
      /collision_mask_hex/u
    );

    assert.doesNotMatch(
      source,
      /player_one_x|player_one_y|player_two_x|player_two_y/u
    );

    assert.doesNotMatch(
      source,
      /cingArtilleryCombatWorld/u
    );
  }
);


test(
  "processor composes deterministic canonical physics authority",
  () => {
    const source =
      fs.readFileSync(
        processorPath,
        "utf8"
      );

    const required = [
      "deriveMuzzleOriginV1",
      "deriveLaunchVectorV1",
      "deriveInitialVelocityV1",
      "mapWorldAccelerationV1",
      "deriveMutableOpponentBindingV1",
      "solveShotTrajectoryV1",
      "classifyBlastTargetEligibilityV1",
      "calculateExactBlastDistanceFloorV1",
      "materializeCanonicalShotTargetV1",
      "deriveCombatDamageStatBindingV1",
      "materializeCanonicalShotDamageV1",
      "projectResolutionPersistenceV1",
      "commitResolutionWithTrajectoryFencedAtomic",
    ];

    for (
      const token
      of required
    ) {
      assert.match(
        source,
        new RegExp(
          `\\b${token}\\b`,
          "u"
        )
      );
    }

    assert.doesNotMatch(
      source,
      /Math\.(sin|cos|sqrt)/u
    );
  }
);


test(
  "processor owns neither claim/retry scheduling nor feature gates",
  () => {
    const source =
      fs.readFileSync(
        processorPath,
        "utf8"
      );

    assert.doesNotMatch(
      source,
      /claimShotExecutions|releaseShotExecution|setInterval|process\.env/u
    );
  }
);
