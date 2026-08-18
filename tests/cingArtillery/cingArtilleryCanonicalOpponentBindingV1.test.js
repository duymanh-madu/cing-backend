"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  CANONICAL_PLAYER_SLOT_V1,
  deriveCanonicalOpponentBindingV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryCanonicalOpponentBindingV1"
  );


const PLAYER_ONE_ACCOUNT =
  "11111111-1111-4111-8111-111111111111";

const PLAYER_ONE_SESSION =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const PLAYER_TWO_ACCOUNT =
  "22222222-2222-4222-8222-222222222222";

const PLAYER_TWO_SESSION =
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const COMBAT_STATE_ID =
  "33333333-3333-4333-8333-333333333333";

const RUNTIME_ID =
  "44444444-4444-4444-8444-444444444444";

const MATCH_ID =
  "55555555-5555-4555-8555-555555555555";

const TURN_ID =
  "66666666-6666-4666-8666-666666666666";

const WORLD_ID =
  "77777777-7777-4777-8777-777777777777";

const MAP_ID =
  "88888888-8888-4888-8888-888888888888";

const SPAWN_PAIR_ID =
  "99999999-9999-4999-8999-999999999999";


function turnState({
  activeAccountId =
    PLAYER_ONE_ACCOUNT,

  activeSessionId =
    PLAYER_ONE_SESSION,
} = {}) {
  return {
    id:
      TURN_ID,

    combat_state_id:
      COMBAT_STATE_ID,

    match_runtime_id:
      RUNTIME_ID,

    match_id:
      MATCH_ID,

    player_one_account_id:
      PLAYER_ONE_ACCOUNT,

    player_one_session_id:
      PLAYER_ONE_SESSION,

    player_two_account_id:
      PLAYER_TWO_ACCOUNT,

    player_two_session_id:
      PLAYER_TWO_SESSION,

    status:
      "active",

    turn_number:
      1,

    active_account_id:
      activeAccountId,

    active_session_id:
      activeSessionId,

    initiative_reason:
      "speed",

    turn_started_at:
      "2026-08-19T00:00:00.000Z",

    turn_deadline_at:
      "2026-08-19T00:00:15.000Z",

    created_at:
      "2026-08-19T00:00:00.000Z",

    updated_at:
      "2026-08-19T00:00:00.000Z",
  };
}


function combatWorld(
  overrides =
    {}
) {
  return {
    id:
      WORLD_ID,

    combat_state_id:
      COMBAT_STATE_ID,

    match_runtime_id:
      RUNTIME_ID,

    match_id:
      MATCH_ID,

    map_id:
      MAP_ID,

    spawn_pair_id:
      SPAWN_PAIR_ID,

    player_one_side:
      "a",

    player_two_side:
      "b",

    player_one_x:
      10,

    player_one_y:
      20,

    player_two_x:
      90,

    player_two_y:
      30,

    initial_wind:
      0,

    initialized_at:
      "2026-08-19T00:00:00.000Z",

    created_at:
      "2026-08-19T00:00:00.000Z",

    ...overrides,
  };
}


function bind({
  turn =
    turnState(),

  world =
    combatWorld(),

  shooterAccountId =
    PLAYER_ONE_ACCOUNT,

  shooterSessionId =
    PLAYER_ONE_SESSION,
} = {}) {
  return deriveCanonicalOpponentBindingV1({
    turnState:
      turn,

    combatWorld:
      world,

    shooterAccountId,
    shooterSessionId,

    physicsFixedScale:
      1000,

    playerHitRadiusScaled:
      5000n,

    playerHitCenterOffsetYScaled:
      12000n,
  });
}


test(
  "player one shooter binds player two identity and spawn",
  () => {
    const result =
      bind();


    assert.equal(
      result.shooter_slot,
      "player_one"
    );

    assert.equal(
      result.opponent_slot,
      "player_two"
    );

    assert.equal(
      result.opponent_account_id,
      PLAYER_TWO_ACCOUNT
    );

    assert.equal(
      result.opponent_session_id,
      PLAYER_TWO_SESSION
    );

    assert.equal(
      result.opponent_spawn_x,
      90
    );

    assert.equal(
      result.opponent_spawn_y,
      30
    );

    assert.deepEqual(
      result.opponent_collider,
      {
        spawn_x_scaled:
          90000n,

        spawn_y_scaled:
          30000n,

        center_x_scaled:
          90000n,

        center_y_scaled:
          18000n,

        radius_scaled:
          5000n,
      }
    );
  }
);


test(
  "player two shooter symmetrically binds player one",
  () => {
    const result =
      bind({
        turn:
          turnState({
            activeAccountId:
              PLAYER_TWO_ACCOUNT,

            activeSessionId:
              PLAYER_TWO_SESSION,
          }),

        shooterAccountId:
          PLAYER_TWO_ACCOUNT,

        shooterSessionId:
          PLAYER_TWO_SESSION,
      });


    assert.equal(
      result.shooter_slot,
      "player_two"
    );

    assert.equal(
      result.opponent_slot,
      "player_one"
    );

    assert.equal(
      result.opponent_account_id,
      PLAYER_ONE_ACCOUNT
    );

    assert.equal(
      result.opponent_session_id,
      PLAYER_ONE_SESSION
    );

    assert.equal(
      result.opponent_spawn_x,
      10
    );

    assert.equal(
      result.opponent_spawn_y,
      20
    );

    assert.equal(
      result.opponent_collider.center_x_scaled,
      10000n
    );

    assert.equal(
      result.opponent_collider.center_y_scaled,
      8000n
    );
  }
);


test(
  "side labels never change participant identity binding",
  () => {
    const result =
      bind({
        world:
          combatWorld({
            player_one_side:
              "b",

            player_two_side:
              "a",
          }),
      });


    assert.equal(
      result.opponent_account_id,
      PLAYER_TWO_ACCOUNT
    );

    assert.equal(
      result.opponent_spawn_x,
      90
    );
  }
);


test(
  "shooter must be canonical active account and session pair",
  () => {
    assert.throws(
      () =>
        bind({
          shooterAccountId:
            PLAYER_TWO_ACCOUNT,

          shooterSessionId:
            PLAYER_TWO_SESSION,
        }),
      {
        code:
          "CING_ARTILLERY_CANONICAL_OPPONENT_SHOOTER_MISMATCH_V1",
      }
    );


    assert.throws(
      () =>
        bind({
          shooterAccountId:
            PLAYER_ONE_ACCOUNT,

          shooterSessionId:
            PLAYER_TWO_SESSION,
        }),
      {
        code:
          "CING_ARTILLERY_CANONICAL_OPPONENT_SHOOTER_MISMATCH_V1",
      }
    );
  }
);


test(
  "combat world identity must match turn identity",
  () => {
    assert.throws(
      () =>
        bind({
          world:
            combatWorld({
              combat_state_id:
                "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
            }),
        }),
      {
        code:
          "CING_ARTILLERY_CANONICAL_OPPONENT_WORLD_IDENTITY_MISMATCH_V1",
      }
    );
  }
);


test(
  "binding and opponent collider are immutable",
  () => {
    const result =
      bind();


    assert.ok(
      Object.isFrozen(
        result
      )
    );

    assert.ok(
      Object.isFrozen(
        result.opponent_collider
      )
    );

    assert.ok(
      Object.isFrozen(
        CANONICAL_PLAYER_SLOT_V1
      )
    );
  }
);


test(
  "pending turn cannot establish shooter/opponent authority",
  () => {
    const pending = {
      ...turnState(),

      status:
        "pending",

      turn_number:
        0,

      active_account_id:
        null,

      active_session_id:
        null,

      initiative_reason:
        null,

      turn_started_at:
        null,

      turn_deadline_at:
        null,
    };


    assert.throws(
      () =>
        bind({
          turn:
            pending,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_CANONICAL_OPPONENT_BINDING_V1",
      }
    );
  }
);
