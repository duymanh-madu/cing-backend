"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  deriveCombatDamageStatBindingV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryCombatDamageStatBindingV1"
  );


const TURN_ID =
  "10000000-0000-4000-8000-000000000001";

const COMBAT_ID =
  "20000000-0000-4000-8000-000000000001";

const RUNTIME_ID =
  "30000000-0000-4000-8000-000000000001";

const MATCH_ID =
  "40000000-0000-4000-8000-000000000001";

const P1_ACCOUNT =
  "50000000-0000-4000-8000-000000000001";

const P1_SESSION =
  "60000000-0000-4000-8000-000000000001";

const P2_ACCOUNT =
  "70000000-0000-4000-8000-000000000001";

const P2_SESSION =
  "80000000-0000-4000-8000-000000000001";


function rulesV1() {
  return {
    version:
      1,

    max_hp:
      1000,

    turn_duration_ms:
      15000,

    gravity:
      980,

    wind_min:
      -100,

    wind_max:
      100,

    angle_min_deg:
      10,

    angle_max_deg:
      80,

    power_min:
      0,

    power_max:
      100,

    base_damage:
      300,

    blast_radius:
      120,
  };
}


function combatState(
  overrides = {}
) {
  return {
    id:
      COMBAT_ID,

    match_runtime_id:
      RUNTIME_ID,

    match_id:
      MATCH_ID,

    player_one_account_id:
      P1_ACCOUNT,

    player_one_session_id:
      P1_SESSION,

    player_two_account_id:
      P2_ACCOUNT,

    player_two_session_id:
      P2_SESSION,

    status:
      "initialized",

    rules_version:
      1,

    rules_snapshot:
      rulesV1(),

    player_one_stats_snapshot: {
      max_hp:
        1000,

      attack:
        111,

      defense:
        122,

      speed:
        133,
    },

    player_two_stats_snapshot: {
      max_hp:
        1000,

      attack:
        211,

      defense:
        222,

      speed:
        233,
    },

    initialized_at:
      "2026-08-19T00:00:00.000Z",

    created_at:
      "2026-08-19T00:00:00.000Z",

    updated_at:
      "2026-08-19T00:00:00.000Z",

    ...overrides,
  };
}


function turnState({
  shooter =
    "player_one",

  ...overrides
} = {}) {
  const playerOne =
    shooter ===
      "player_one";

  return {
    id:
      TURN_ID,

    combat_state_id:
      COMBAT_ID,

    match_runtime_id:
      RUNTIME_ID,

    match_id:
      MATCH_ID,

    player_one_account_id:
      P1_ACCOUNT,

    player_one_session_id:
      P1_SESSION,

    player_two_account_id:
      P2_ACCOUNT,

    player_two_session_id:
      P2_SESSION,

    status:
      "active",

    turn_number:
      1,

    active_account_id:
      playerOne
        ? P1_ACCOUNT
        : P2_ACCOUNT,

    active_session_id:
      playerOne
        ? P1_SESSION
        : P2_SESSION,

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

    ...overrides,
  };
}


function opponentBinding(
  shooter =
    "player_one",
  overrides = {}
) {
  const playerOne =
    shooter ===
      "player_one";

  return {
    shooter_slot:
      playerOne
        ? "player_one"
        : "player_two",

    shooter_account_id:
      playerOne
        ? P1_ACCOUNT
        : P2_ACCOUNT,

    shooter_session_id:
      playerOne
        ? P1_SESSION
        : P2_SESSION,

    opponent_slot:
      playerOne
        ? "player_two"
        : "player_one",

    opponent_account_id:
      playerOne
        ? P2_ACCOUNT
        : P1_ACCOUNT,

    opponent_session_id:
      playerOne
        ? P2_SESSION
        : P1_SESSION,

    ...overrides,
  };
}


test(
  "player one shooter binds player one attack and player two defense",
  () => {
    const result =
      deriveCombatDamageStatBindingV1({
        turnState:
          turnState({
            shooter:
              "player_one",
          }),

        combatState:
          combatState(),

        opponentBinding:
          opponentBinding(
            "player_one"
          ),
      });


    assert.deepEqual(
      result,
      {
        shooter_slot:
          "player_one",

        shooter_account_id:
          P1_ACCOUNT,

        shooter_session_id:
          P1_SESSION,

        attacker_attack:
          111,

        opponent_slot:
          "player_two",

        opponent_account_id:
          P2_ACCOUNT,

        opponent_session_id:
          P2_SESSION,

        defender_defense:
          222,
      }
    );
  }
);


test(
  "player two shooter binds player two attack and player one defense",
  () => {
    const result =
      deriveCombatDamageStatBindingV1({
        turnState:
          turnState({
            shooter:
              "player_two",
          }),

        combatState:
          combatState(),

        opponentBinding:
          opponentBinding(
            "player_two"
          ),
      });


    assert.equal(
      result.attacker_attack,
      211
    );

    assert.equal(
      result.defender_defense,
      122
    );

    assert.equal(
      result.shooter_slot,
      "player_two"
    );

    assert.equal(
      result.opponent_slot,
      "player_one"
    );
  }
);


test(
  "binding output is immutable",
  () => {
    const result =
      deriveCombatDamageStatBindingV1({
        turnState:
          turnState(),

        combatState:
          combatState(),

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


test(
  "combat and turn must describe the same authoritative chain",
  () => {
    assert.throws(
      () =>
        deriveCombatDamageStatBindingV1({
          turnState:
            turnState(),

          combatState:
            combatState({
              match_id:
                "90000000-0000-4000-8000-000000000001",
            }),

          opponentBinding:
            opponentBinding(),
        }),
      {
        code:
          "CING_ARTILLERY_COMBAT_DAMAGE_STAT_COMBAT_TURN_IDENTITY_MISMATCH_V1",
      }
    );
  }
);


test(
  "combat participant pair cannot diverge from turn participant pair",
  () => {
    assert.throws(
      () =>
        deriveCombatDamageStatBindingV1({
          turnState:
            turnState(),

          combatState:
            combatState({
              player_one_account_id:
                P2_ACCOUNT,
            }),

          opponentBinding:
            opponentBinding(),
        }),
      {
        code:
          "CING_ARTILLERY_COMBAT_DAMAGE_STAT_COMBAT_TURN_IDENTITY_MISMATCH_V1",
      }
    );
  }
);


test(
  "fabricated shooter slot fails closed",
  () => {
    assert.throws(
      () =>
        deriveCombatDamageStatBindingV1({
          turnState:
            turnState(),

          combatState:
            combatState(),

          opponentBinding:
            opponentBinding(
              "player_one",
              {
                shooter_slot:
                  "player_two",
              }
            ),
        }),
      {
        code:
          "CING_ARTILLERY_COMBAT_DAMAGE_STAT_OPPONENT_BINDING_MISMATCH_V1",
      }
    );
  }
);


test(
  "fabricated opponent identity fails closed",
  () => {
    assert.throws(
      () =>
        deriveCombatDamageStatBindingV1({
          turnState:
            turnState(),

          combatState:
            combatState(),

          opponentBinding:
            opponentBinding(
              "player_one",
              {
                opponent_account_id:
                  P1_ACCOUNT,
              }
            ),
        }),
      {
        code:
          "CING_ARTILLERY_COMBAT_DAMAGE_STAT_OPPONENT_BINDING_MISMATCH_V1",
      }
    );
  }
);


test(
  "completed combat cannot materialize damage stats",
  () => {
    assert.throws(
      () =>
        deriveCombatDamageStatBindingV1({
          turnState:
            turnState(),

          combatState:
            combatState({
              status:
                "completed",
            }),

          opponentBinding:
            opponentBinding(),
        }),
      {
        code:
          "CING_ARTILLERY_COMBAT_DAMAGE_STAT_COMBAT_NOT_INITIALIZED_V1",
      }
    );
  }
);


test(
  "non-active turn cannot materialize damage stats",
  () => {
    const pending =
      turnState({
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
      });


    assert.throws(
      () =>
        deriveCombatDamageStatBindingV1({
          turnState:
            pending,

          combatState:
            combatState(),

          opponentBinding:
            opponentBinding(),
        }),
      {
        code:
          "CING_ARTILLERY_COMBAT_DAMAGE_STAT_TURN_NOT_ACTIVE_V1",
      }
    );
  }
);


test(
  "invalid combat stat snapshot fails through canonical combat contract",
  () => {
    assert.throws(
      () =>
        deriveCombatDamageStatBindingV1({
          turnState:
            turnState(),

          combatState:
            combatState({
              player_one_stats_snapshot: {
                max_hp:
                  1000,

                attack:
                  0,

                defense:
                  122,

                speed:
                  133,
              },
            }),

          opponentBinding:
            opponentBinding(),
        })
    );
  }
);


test(
  "world geometry fields cannot influence stat binding",
  () => {
    const result =
      deriveCombatDamageStatBindingV1({
        turnState:
          turnState(),

        combatState:
          combatState(),

        opponentBinding:
          opponentBinding(
            "player_one",
            {
              opponent_spawn_x:
                "malicious",

              opponent_spawn_y:
                null,

              opponent_collider: {
                arbitrary:
                  true,
              },

              opponent_side:
                "B",
            }
          ),
      });


    assert.equal(
      result.attacker_attack,
      111
    );

    assert.equal(
      result.defender_defense,
      222
    );
  }
);
