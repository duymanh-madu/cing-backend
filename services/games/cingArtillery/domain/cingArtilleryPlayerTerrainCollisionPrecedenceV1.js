"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * PLAYER VS TERRAIN COLLISION PRECEDENCE V1
 *
 * Pure deterministic precedence over two already-derived
 * exact ContactParameterV1 values:
 *
 *   player_contact
 *   terrain_contact
 *
 * Inputs:
 *
 *   null | canonical ContactParameterV1
 *
 * Output:
 *
 *   null
 *
 * or immutable:
 *
 *   {
 *     collision_kind:
 *       "player" | "terrain",
 *
 *     contact_parameter:
 *       ContactParameterV1
 *   }
 *
 * Canonical ordering:
 *
 *   player < terrain
 *     -> player
 *
 *   terrain < player
 *     -> terrain
 *
 *   player == terrain
 *     -> PLAYER
 *
 * -------------------------------------------------------
 * EXACT TIE POLICY V1
 * -------------------------------------------------------
 *
 * PLAYER wins exact ties.
 *
 * Reason:
 *
 * Player collision represents direct projectile contact.
 *
 * Terrain collision represents terrain impact, which may
 * subsequently produce blast damage.
 *
 * Player colliders are derived from ground-contact spawn
 * anchors and may geometrically touch terrain boundaries.
 *
 * Therefore exact simultaneous contact with player and
 * terrain must preserve direct-hit semantics rather than
 * allow terrain geometry to swallow the player collision.
 *
 * This policy is explicit and independent of:
 *
 *   caller order
 *   terrain iteration order
 *   rational / irrational representation
 *   object identity
 *
 * This module owns ONLY player-vs-terrain precedence.
 *
 * It does NOT:
 *
 *   calculate player contact
 *   calculate terrain contact
 *   inspect trajectory
 *   inspect player collider
 *   inspect terrain
 *   inspect bitmask
 *   classify out_of_bounds
 *   calculate impact coordinates
 *   identify target account
 *   produce shot-resolution outcome
 *   calculate damage
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  compareContactParametersV1,
} =
  require(
    "./cingArtilleryContactParameterComparatorV1"
  );


const PLAYER_TERRAIN_COLLISION_KIND_V1 =
  Object.freeze({
    PLAYER:
      "player",

    TERRAIN:
      "terrain",
  });


const PLAYER_TERRAIN_EXACT_TIE_POLICY_V1 =
  "player";


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_PLAYER_TERRAIN_COLLISION_PRECEDENCE_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertContactParameterOrNull(
  value,
  field
) {
  if (
    value === null
  ) {
    return null;
  }


  /*
   * Comparator owns canonical ContactParameterV1
   * validation.
   *
   * Comparing the parameter with itself validates its
   * representation without duplicating rational/quadratic
   * canonicalization rules here.
   */
  let comparison;

  try {
    comparison =
      compareContactParametersV1(
        value,
        value
      );
  } catch (error) {
    throw buildError({
      message:
        `Player/terrain precedence Cing Artillery nhận ${field} không hợp lệ`,
    });
  }


  if (
    comparison !== 0
  ) {
    throw buildError({
      message:
        `Player/terrain precedence Cing Artillery vi phạm self-comparison invariant: ${field}`,
      code:
        "CING_ARTILLERY_PLAYER_TERRAIN_PRECEDENCE_SELF_COMPARE_INVARIANT_V1",
    });
  }


  return value;
}


function createCollisionResult({
  collisionKind,
  contactParameter,
}) {
  return Object.freeze({
    collision_kind:
      collisionKind,

    contact_parameter:
      contactParameter,
  });
}


function resolvePlayerTerrainCollisionPrecedenceV1({
  playerContact,
  terrainContact,
}) {
  const player =
    assertContactParameterOrNull(
      playerContact,
      "player_contact"
    );

  const terrain =
    assertContactParameterOrNull(
      terrainContact,
      "terrain_contact"
    );


  if (
    player === null &&
    terrain === null
  ) {
    return null;
  }


  if (
    terrain === null
  ) {
    return createCollisionResult({
      collisionKind:
        PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER,

      contactParameter:
        player,
    });
  }


  if (
    player === null
  ) {
    return createCollisionResult({
      collisionKind:
        PLAYER_TERRAIN_COLLISION_KIND_V1.TERRAIN,

      contactParameter:
        terrain,
    });
  }


  const comparison =
    compareContactParametersV1(
      player,
      terrain
    );


  /*
   * Player wins:
   *
   *   player earlier
   *
   * AND
   *
   *   exact simultaneous player/terrain contact.
   *
   * The <= relation is the explicit V1 tie policy.
   */
  if (
    comparison <= 0
  ) {
    return createCollisionResult({
      collisionKind:
        PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER,

      contactParameter:
        player,
    });
  }


  return createCollisionResult({
    collisionKind:
      PLAYER_TERRAIN_COLLISION_KIND_V1.TERRAIN,

    contactParameter:
      terrain,
  });
}


module.exports = {
  PLAYER_TERRAIN_COLLISION_KIND_V1,
  PLAYER_TERRAIN_EXACT_TIE_POLICY_V1,

  resolvePlayerTerrainCollisionPrecedenceV1,
};
