"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  CING_ARTILLERY_FIRE_DIRECTION_V1,
  deriveHorizontalFireDirectionV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryFireDirectionV1"
  );

const {
  normalizeCombatWorldRecord,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryCombatWorldContracts"
  );


test(
  "opponent to the right produces +X direction",
  () => {
    const result =
      deriveHorizontalFireDirectionV1({
        shooterX: 100,
        opponentX: 700,
      });

    assert.equal(
      result.direction,
      CING_ARTILLERY_FIRE_DIRECTION_V1.RIGHT
    );

    assert.equal(
      result.x_sign,
      1n
    );
  }
);


test(
  "opponent to the left produces -X direction",
  () => {
    const result =
      deriveHorizontalFireDirectionV1({
        shooterX: 700,
        opponentX: 100,
      });

    assert.equal(
      result.direction,
      CING_ARTILLERY_FIRE_DIRECTION_V1.LEFT
    );

    assert.equal(
      result.x_sign,
      -1n
    );
  }
);


test(
  "direction is independent of side A/B naming",
  () => {
    const aTowardsB =
      deriveHorizontalFireDirectionV1({
        shooterX: 900,
        opponentX: 100,
      });

    const bTowardsA =
      deriveHorizontalFireDirectionV1({
        shooterX: 100,
        opponentX: 900,
      });

    assert.equal(
      aTowardsB.direction,
      "left"
    );

    assert.equal(
      bTowardsA.direction,
      "right"
    );
  }
);


test(
  "equal horizontal coordinate fails closed",
  () => {
    assert.throws(
      () =>
        deriveHorizontalFireDirectionV1({
          shooterX: 500,
          opponentX: 500,
        }),
      {
        code:
          "CING_ARTILLERY_HORIZONTAL_FIRE_DIRECTION_UNDEFINED",
      }
    );
  }
);


test(
  "combat world contract rejects equal X even when Y differs",
  () => {
    assert.throws(
      () =>
        normalizeCombatWorldRecord({
          id:
            "11111111-1111-4111-8111-111111111111",

          combat_state_id:
            "22222222-2222-4222-8222-222222222222",

          match_runtime_id:
            "33333333-3333-4333-8333-333333333333",

          match_id:
            "44444444-4444-4444-8444-444444444444",

          map_id:
            "55555555-5555-4555-8555-555555555555",

          spawn_pair_id:
            "66666666-6666-4666-8666-666666666666",

          player_one_side:
            "a",

          player_two_side:
            "b",

          player_one_x:
            500,

          player_one_y:
            300,

          player_two_x:
            500,

          player_two_y:
            400,

          initial_wind:
            0,

          initialized_at:
            "2026-08-17T00:00:00.000Z",

          created_at:
            "2026-08-17T00:00:00.000Z",
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_COMBAT_WORLD",
      }
    );
  }
);


test(
  "combat world keeps arbitrary A/B left-right placement valid",
  () => {
    const world =
      normalizeCombatWorldRecord({
        id:
          "11111111-1111-4111-8111-111111111111",

        combat_state_id:
          "22222222-2222-4222-8222-222222222222",

        match_runtime_id:
          "33333333-3333-4333-8333-333333333333",

        match_id:
          "44444444-4444-4444-8444-444444444444",

        map_id:
          "55555555-5555-4555-8555-555555555555",

        spawn_pair_id:
          "66666666-6666-4666-8666-666666666666",

        player_one_side:
          "a",

        player_two_side:
          "b",

        player_one_x:
          900,

        player_one_y:
          300,

        player_two_x:
          100,

        player_two_y:
          300,

        initial_wind:
          0,

        initialized_at:
          "2026-08-17T00:00:00.000Z",

        created_at:
          "2026-08-17T00:00:00.000Z",
      });

    assert.equal(
      world.player_one_side,
      "a"
    );

    assert.equal(
      world.player_one_x,
      900
    );

    assert.equal(
      deriveHorizontalFireDirectionV1({
        shooterX:
          world.player_one_x,

        opponentX:
          world.player_two_x,
      }).direction,
      "left"
    );
  }
);
