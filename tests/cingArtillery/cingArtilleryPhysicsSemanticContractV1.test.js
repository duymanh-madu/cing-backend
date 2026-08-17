"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  PHYSICS_SEMANTIC_VERSION_V1,
  PHYSICS_TIME_UNITS_PER_SECOND_V1,
  WORLD_X_RIGHT_SIGN_V1,
  WORLD_Y_DOWN_SIGN_V1,

  assertPhysicsVersionV1,
  normalizePhysicsTimeStepV1,
  mapWorldAccelerationV1,
  getPhysicsSemanticContractV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryPhysicsSemanticContractV1"
  );


test(
  "physics semantic v1 locks canonical world axes and physical units",
  () => {
    const contract =
      getPhysicsSemanticContractV1();

    assert.equal(
      contract.physics_version,
      1
    );

    assert.equal(
      contract.world_x_positive,
      "right"
    );

    assert.equal(
      contract.world_y_positive,
      "down"
    );

    assert.equal(
      contract.position_unit,
      "pixel"
    );

    assert.equal(
      contract.time_unit,
      "second"
    );

    assert.equal(
      contract.velocity_unit,
      "pixel_per_second"
    );

    assert.equal(
      contract.acceleration_unit,
      "pixel_per_second_squared"
    );

    assert.equal(
      contract.physics_step_storage_unit,
      "millisecond"
    );

    assert.equal(
      contract.power_velocity_scale_unit,
      "pixel_per_second_per_power_unit"
    );
  }
);


test(
  "physics semantic v1 locks world-relative wind and downward gravity",
  () => {
    const contract =
      getPhysicsSemanticContractV1();

    assert.equal(
      contract.wind_reference_frame,
      "world_x"
    );

    assert.equal(
      contract.positive_wind_direction,
      "right"
    );

    assert.equal(
      contract.negative_wind_direction,
      "left"
    );

    assert.equal(
      contract.gravity_direction,
      "down"
    );

    assert.equal(
      contract.world_x_right_sign,
      1n
    );

    assert.equal(
      contract.world_y_down_sign,
      1n
    );
  }
);


test(
  "10 ms physics step is represented exactly as 10 over 1000 second",
  () => {
    const step =
      normalizePhysicsTimeStepV1({
        physicsVersion:
          1,

        physicsStepMs:
          10,
      });

    assert.deepEqual(
      step,
      {
        physics_version:
          1,

        physics_step_ms:
          10,

        dt_seconds_numerator:
          10n,

        dt_seconds_denominator:
          1000n,
      }
    );
  }
);


test(
  "time-step contract does not round non-divisor millisecond steps",
  () => {
    const step =
      normalizePhysicsTimeStepV1({
        physicsVersion:
          1,

        physicsStepMs:
          17,
      });

    assert.equal(
      step.dt_seconds_numerator,
      17n
    );

    assert.equal(
      step.dt_seconds_denominator,
      1000n
    );
  }
);


test(
  "positive wind maps exactly to world +X acceleration",
  () => {
    const acceleration =
      mapWorldAccelerationV1({
        physicsVersion:
          1,

        gravityScaled:
          980000n,

        initialWindScaled:
          100000n,
      });

    assert.equal(
      acceleration.ax_scaled,
      100000n
    );

    assert.equal(
      acceleration.ay_scaled,
      980000n
    );
  }
);


test(
  "negative wind maps exactly to world -X acceleration",
  () => {
    const acceleration =
      mapWorldAccelerationV1({
        physicsVersion:
          1,

        gravityScaled:
          980000n,

        initialWindScaled:
          -100000n,
      });

    assert.equal(
      acceleration.ax_scaled,
      -100000n
    );

    assert.equal(
      acceleration.ay_scaled,
      980000n
    );
  }
);


test(
  "zero wind produces zero world X acceleration",
  () => {
    const acceleration =
      mapWorldAccelerationV1({
        physicsVersion:
          1,

        gravityScaled:
          980000n,

        initialWindScaled:
          0n,
      });

    assert.equal(
      acceleration.ax_scaled,
      0n
    );

    assert.equal(
      acceleration.ay_scaled,
      980000n
    );
  }
);


test(
  "gravity must remain positive because world +Y is down",
  () => {
    assert.throws(
      () =>
        mapWorldAccelerationV1({
          physicsVersion:
            1,

          gravityScaled:
            0n,

          initialWindScaled:
            0n,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_PHYSICS_SEMANTIC_V1",
      }
    );

    assert.throws(
      () =>
        mapWorldAccelerationV1({
          physicsVersion:
            1,

          gravityScaled:
            -1n,

          initialWindScaled:
            0n,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_PHYSICS_SEMANTIC_V1",
      }
    );
  }
);


test(
  "unsupported physics versions fail closed",
  () => {
    assert.throws(
      () =>
        assertPhysicsVersionV1(
          2
        ),
      {
        code:
          "CING_ARTILLERY_UNSUPPORTED_PHYSICS_VERSION",
      }
    );

    assert.throws(
      () =>
        normalizePhysicsTimeStepV1({
          physicsVersion:
            2,

          physicsStepMs:
            10,
        }),
      {
        code:
          "CING_ARTILLERY_UNSUPPORTED_PHYSICS_VERSION",
      }
    );

    assert.throws(
      () =>
        mapWorldAccelerationV1({
          physicsVersion:
            2,

          gravityScaled:
            980000n,

          initialWindScaled:
            0n,
        }),
      {
        code:
          "CING_ARTILLERY_UNSUPPORTED_PHYSICS_VERSION",
      }
    );
  }
);


test(
  "physics step must be a positive safe integer millisecond value",
  () => {
    for (
      const invalid of
      [
        0,
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
        "10",
        null,
      ]
    ) {
      assert.throws(
        () =>
          normalizePhysicsTimeStepV1({
            physicsVersion:
              1,

            physicsStepMs:
              invalid,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PHYSICS_SEMANTIC_V1",
        }
      );
    }
  }
);


test(
  "semantic constants remain exact and immutable by convention",
  () => {
    assert.equal(
      PHYSICS_SEMANTIC_VERSION_V1,
      1
    );

    assert.equal(
      PHYSICS_TIME_UNITS_PER_SECOND_V1,
      1000n
    );

    assert.equal(
      WORLD_X_RIGHT_SIGN_V1,
      1n
    );

    assert.equal(
      WORLD_Y_DOWN_SIGN_V1,
      1n
    );

    assert.equal(
      Object.isFrozen(
        getPhysicsSemanticContractV1()
      ),
      true
    );

    assert.equal(
      Object.isFrozen(
        normalizePhysicsTimeStepV1({
          physicsVersion:
            1,

          physicsStepMs:
            10,
        })
      ),
      true
    );

    assert.equal(
      Object.isFrozen(
        mapWorldAccelerationV1({
          physicsVersion:
            1,

          gravityScaled:
            980000n,

          initialWindScaled:
            0n,
        })
      ),
      true
    );
  }
);
