"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SHOT SEGMENT COLLISION CLASSIFIER V1
 *
 * Thin deterministic orchestration for exactly one
 * canonical trajectory segment.
 *
 * Pipeline:
 *
 *   trajectory segment
 *   + projectile radius
 *   + canonical player collider
 *   + canonical terrain geometry
 *
 *        |
 *        +-> player earliest contact
 *        |
 *        +-> terrain earliest contact
 *        |
 *        -> player/terrain precedence
 *
 * Output:
 *
 *   null
 *
 * or the immutable result owned by:
 *
 *   PlayerTerrainCollisionPrecedenceV1
 *
 *   {
 *     collision_kind:
 *       "player" | "terrain",
 *
 *     contact_parameter:
 *       ContactParameterV1
 *   }
 *
 * IMPORTANT:
 *
 * This classifier intentionally does NOT introduce an
 * aggregate world/map context object.
 *
 * Existing authoritative boundaries do not expose one
 * canonical object containing all collision inputs:
 *
 *   CombatWorld
 *     owns map identity / spawn / side / wind
 *
 *   PublishedMapRecord
 *     owns map metadata / dimensions / mask hash
 *     but does not expose raw collision_mask
 *
 * Therefore this classifier accepts exactly the primitive
 * inputs already required by its locked child authorities.
 *
 * Validation remains delegated to those child authorities.
 * Their canonical rules are not duplicated here.
 *
 * Both player and terrain earliest-contact authorities are
 * always evaluated before precedence is resolved.
 *
 * This preserves deterministic validation semantics and
 * avoids introducing optimization-dependent authority.
 *
 * This module does NOT:
 *
 *   build trajectory segments
 *   derive player colliders
 *   normalize collision geometry rules
 *   normalize combat world state
 *   normalize published maps
 *   inspect account identity
 *   classify out_of_bounds
 *   calculate impact coordinates
 *   produce player_hit / terrain_hit
 *   identify target accounts
 *   calculate blast damage
 *   calculate HP mutation
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  sweptProjectilePlayerEarliestContactV1,
} =
  require(
    "./cingArtillerySweptProjectilePlayerEarliestContactV1"
  );

const {
  sweptProjectileTerrainEarliestContactV1,
} =
  require(
    "./cingArtillerySweptProjectileTerrainEarliestContactV1"
  );

const {
  resolvePlayerTerrainCollisionPrecedenceV1,
} =
  require(
    "./cingArtilleryPlayerTerrainCollisionPrecedenceV1"
  );


function classifyShotSegmentCollisionV1({
  trajectorySegment,
  projectileRadiusScaled,
  playerCollider,

  physicsFixedScale,

  widthPx,
  heightPx,
  collisionMask,
} = {}) {
  const playerContact =
    sweptProjectilePlayerEarliestContactV1({
      trajectorySegment,
      projectileRadiusScaled,
      playerCollider,
    });


  const terrainContact =
    sweptProjectileTerrainEarliestContactV1({
      trajectorySegment,
      projectileRadiusScaled,

      physicsFixedScale,

      widthPx,
      heightPx,
      collisionMask,
    });


  return resolvePlayerTerrainCollisionPrecedenceV1({
    playerContact,
    terrainContact,
  });
}


module.exports = {
  classifyShotSegmentCollisionV1,
};
