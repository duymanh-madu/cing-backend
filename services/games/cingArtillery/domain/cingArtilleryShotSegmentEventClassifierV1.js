"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SHOT SEGMENT EVENT CLASSIFIER V1
 *
 * Thin deterministic orchestration for exactly one
 * canonical trajectory segment.
 *
 * Pipeline:
 *
 *   ShotSegmentCollisionClassifierV1
 *
 *     player + terrain collision arbitration
 *
 *   ProjectileWorldExitClassificationV1
 *
 *     boundary_exit vs already_outside semantics
 *
 *   CollisionWorldExitPrecedenceV1
 *
 *     exact final segment-event arbitration
 *
 * Output:
 *
 *   null
 *
 * or immutable result owned by:
 *
 *   CollisionWorldExitPrecedenceV1
 *
 *   {
 *     segment_event_kind:
 *       "collision" | "world_exit",
 *
 *     collision_kind:
 *       "player" | "terrain" | null,
 *
 *     world_exit_kind:
 *       "boundary_exit" | "already_outside" | null,
 *
 *     contact_parameter:
 *       ContactParameterV1
 *   }
 *
 * IMPORTANT:
 *
 * Both collision classification and world-exit
 * classification are always evaluated before final
 * precedence.
 *
 * This preserves deterministic validation semantics and
 * prevents optimization-dependent authority.
 *
 * This module intentionally accepts the same flat
 * canonical primitives already required by its locked
 * child authorities.
 *
 * It does NOT:
 *
 *   build trajectory segments
 *   derive player colliders
 *   derive collision geometry numeric rules
 *   parse map records
 *   produce player_hit / terrain_hit / out_of_bounds
 *   calculate impact coordinates
 *   identify target account
 *   calculate blast damage
 *   mutate HP
 *   advance turn
 *   terminalize combat
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  classifyShotSegmentCollisionV1,
} =
  require(
    "./cingArtilleryShotSegmentCollisionClassifierV1"
  );

const {
  classifyProjectileWorldExitV1,
} =
  require(
    "./cingArtilleryProjectileWorldExitClassificationV1"
  );

const {
  resolveCollisionWorldExitPrecedenceV1,
} =
  require(
    "./cingArtilleryCollisionWorldExitPrecedenceV1"
  );


function classifyShotSegmentEventV1({
  trajectorySegment,
  projectileRadiusScaled,
  playerCollider,

  physicsFixedScale,

  widthPx,
  heightPx,
  collisionMask,
} = {}) {
  const collision =
    classifyShotSegmentCollisionV1({
      trajectorySegment,
      projectileRadiusScaled,
      playerCollider,

      physicsFixedScale,

      widthPx,
      heightPx,
      collisionMask,
    });


  const worldExit =
    classifyProjectileWorldExitV1({
      trajectorySegment,
      projectileRadiusScaled,

      physicsFixedScale,

      widthPx,
      heightPx,
    });


  return resolveCollisionWorldExitPrecedenceV1({
    collision,
    worldExit,
  });
}


module.exports = {
  classifyShotSegmentEventV1,
};
