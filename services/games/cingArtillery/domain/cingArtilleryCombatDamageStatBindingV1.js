"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * COMBAT DAMAGE STAT BINDING V1
 *
 * Purpose:
 *
 *   canonical active shooter
 *     ->
 *   immutable combat attack snapshot
 *
 *   canonical opponent
 *     ->
 *   immutable combat defense snapshot
 *
 * Identity authorities:
 *
 *   TurnState:
 *     canonical participant account/session pairs
 *     canonical active shooter account/session
 *
 *   CanonicalOpponentBindingV1:
 *     canonical shooter/opponent slots and identities
 *
 * Stat authority:
 *
 *   CombatState:
 *     player_one_stats_snapshot
 *     player_two_stats_snapshot
 *
 * This layer revalidates the complete identity chain before
 * binding stats.
 *
 * It deliberately does NOT use:
 *
 *   combat-world side labels
 *   spawn coordinates
 *   player collider geometry
 *   live character stats
 *   current HP
 *
 * It deliberately does NOT:
 *
 *   calculate damage
 *   calculate blast falloff
 *   mutate HP
 *   write PostgreSQL
 *   emit realtime events
 */

const {
  CING_ARTILLERY_COMBAT_STATE_STATUS,
  normalizeCombatStateRecord,
} =
  require(
    "./cingArtilleryCombatStateContracts"
  );

const {
  CING_ARTILLERY_TURN_STATE_STATUS,
  normalizeTurnStateRecord,
} =
  require(
    "./cingArtilleryTurnStateContracts"
  );

const {
  CANONICAL_PLAYER_SLOT_V1,
} =
  require(
    "./cingArtilleryCanonicalOpponentBindingV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_COMBAT_DAMAGE_STAT_BINDING_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertObject(
  value,
  field
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    throw buildError({
      message:
        `Combat damage stat binding Cing Artillery không hợp lệ: ${field}`,
    });
  }


  return value;
}


function canonicalIdentityText(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}


function assertCombatTurnIdentityV1({
  combat,
  turn,
}) {
  if (
    combat.id !==
      turn.combat_state_id ||
    combat.match_runtime_id !==
      turn.match_runtime_id ||
    combat.match_id !==
      turn.match_id ||
    canonicalIdentityText(
      combat.player_one_account_id
    ) !==
      turn.player_one_account_id ||
    canonicalIdentityText(
      combat.player_one_session_id
    ) !==
      turn.player_one_session_id ||
    canonicalIdentityText(
      combat.player_two_account_id
    ) !==
      turn.player_two_account_id ||
    canonicalIdentityText(
      combat.player_two_session_id
    ) !==
      turn.player_two_session_id
  ) {
    throw buildError({
      message:
        "Combat damage stat binding Cing Artillery có combat/turn identity mismatch",
      code:
        "CING_ARTILLERY_COMBAT_DAMAGE_STAT_COMBAT_TURN_IDENTITY_MISMATCH_V1",
    });
  }
}


function deriveCombatDamageStatBindingV1({
  turnState,
  combatState,
  opponentBinding,
} = {}) {
  const turn =
    normalizeTurnStateRecord(
      turnState
    );


  if (
    !turn ||
    turn.status !==
      CING_ARTILLERY_TURN_STATE_STATUS.ACTIVE
  ) {
    throw buildError({
      message:
        "Combat damage stat binding Cing Artillery yêu cầu active turn state",
      code:
        "CING_ARTILLERY_COMBAT_DAMAGE_STAT_TURN_NOT_ACTIVE_V1",
    });
  }


  const combat =
    normalizeCombatStateRecord(
      combatState
    );


  if (
    !combat ||
    combat.status !==
      CING_ARTILLERY_COMBAT_STATE_STATUS.INITIALIZED
  ) {
    throw buildError({
      message:
        "Combat damage stat binding Cing Artillery yêu cầu initialized combat state",
      code:
        "CING_ARTILLERY_COMBAT_DAMAGE_STAT_COMBAT_NOT_INITIALIZED_V1",
    });
  }


  assertCombatTurnIdentityV1({
    combat,
    turn,
  });


  const opponent =
    assertObject(
      opponentBinding,
      "opponent_binding"
    );


  const shooterIsPlayerOne =
    turn.active_account_id ===
      turn.player_one_account_id &&
    turn.active_session_id ===
      turn.player_one_session_id;

  const shooterIsPlayerTwo =
    turn.active_account_id ===
      turn.player_two_account_id &&
    turn.active_session_id ===
      turn.player_two_session_id;


  if (
    shooterIsPlayerOne ===
      shooterIsPlayerTwo
  ) {
    throw buildError({
      message:
        "Combat damage stat binding Cing Artillery không xác định được canonical shooter slot",
      code:
        "CING_ARTILLERY_COMBAT_DAMAGE_STAT_SHOOTER_SLOT_INVALID_V1",
    });
  }


  const expectedShooterSlot =
    shooterIsPlayerOne
      ? CANONICAL_PLAYER_SLOT_V1.PLAYER_ONE
      : CANONICAL_PLAYER_SLOT_V1.PLAYER_TWO;

  const expectedOpponentSlot =
    shooterIsPlayerOne
      ? CANONICAL_PLAYER_SLOT_V1.PLAYER_TWO
      : CANONICAL_PLAYER_SLOT_V1.PLAYER_ONE;


  const expectedShooterAccountId =
    turn.active_account_id;

  const expectedShooterSessionId =
    turn.active_session_id;

  const expectedOpponentAccountId =
    shooterIsPlayerOne
      ? turn.player_two_account_id
      : turn.player_one_account_id;

  const expectedOpponentSessionId =
    shooterIsPlayerOne
      ? turn.player_two_session_id
      : turn.player_one_session_id;


  if (
    opponent.shooter_slot !==
      expectedShooterSlot ||
    canonicalIdentityText(
      opponent.shooter_account_id
    ) !==
      expectedShooterAccountId ||
    canonicalIdentityText(
      opponent.shooter_session_id
    ) !==
      expectedShooterSessionId ||
    opponent.opponent_slot !==
      expectedOpponentSlot ||
    canonicalIdentityText(
      opponent.opponent_account_id
    ) !==
      expectedOpponentAccountId ||
    canonicalIdentityText(
      opponent.opponent_session_id
    ) !==
      expectedOpponentSessionId
  ) {
    throw buildError({
      message:
        "Combat damage stat binding Cing Artillery có canonical opponent binding mismatch",
      code:
        "CING_ARTILLERY_COMBAT_DAMAGE_STAT_OPPONENT_BINDING_MISMATCH_V1",
    });
  }


  const attackerStats =
    expectedShooterSlot ===
      CANONICAL_PLAYER_SLOT_V1.PLAYER_ONE
      ? combat.player_one_stats_snapshot
      : combat.player_two_stats_snapshot;

  const defenderStats =
    expectedOpponentSlot ===
      CANONICAL_PLAYER_SLOT_V1.PLAYER_ONE
      ? combat.player_one_stats_snapshot
      : combat.player_two_stats_snapshot;


  return Object.freeze({
    shooter_slot:
      expectedShooterSlot,

    shooter_account_id:
      expectedShooterAccountId,

    shooter_session_id:
      expectedShooterSessionId,

    attacker_attack:
      attackerStats.attack,

    opponent_slot:
      expectedOpponentSlot,

    opponent_account_id:
      expectedOpponentAccountId,

    opponent_session_id:
      expectedOpponentSessionId,

    defender_defense:
      defenderStats.defense,
  });
}


module.exports = {
  deriveCombatDamageStatBindingV1,
};
