"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * PROJECTILE WORLD EXIT CLASSIFICATION V1
 *
 * Semantic sibling of:
 *
 *   ProjectileWorldExitContactV1
 *
 * The contact authority returns only:
 *
 *   null | ContactParameterV1
 *
 * which is intentionally geometry-focused.
 *
 * However canonical 0/1 may represent two different
 * world-state meanings:
 *
 *   boundary_exit
 *
 *     projectile center starts inside/on the expanded
 *     closed world and reaches/leaves its boundary
 *
 *   already_outside
 *
 *     projectile center is already completely outside
 *     the expanded closed world at segment start
 *
 * This module preserves that distinction.
 *
 * Return:
 *
 *   null
 *
 * or immutable:
 *
 *   {
 *     world_exit_kind:
 *       "boundary_exit" | "already_outside",
 *
 *     contact_parameter:
 *       ContactParameterV1
 *   }
 *
 * It reuses:
 *
 *   ProjectileExpandedWorldBoundsV1
 *     for canonical start membership
 *
 *   ProjectileWorldExitContactV1
 *     for canonical world-exit parameter
 *
 * It does NOT:
 *
 *   calculate a second exit parameter
 *   inspect terrain
 *   inspect players
 *   compare collision timing
 *   choose collision/OOB precedence
 *   produce shot-resolution outcome
 *   calculate impact
 *   calculate target or damage
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  deriveProjectileExpandedWorldBoundsV1,
  pointInsideProjectileExpandedWorldV1,
} =
  require(
    "./cingArtilleryProjectileExpandedWorldBoundsV1"
  );

const {
  projectileWorldExitContactV1,
} =
  require(
    "./cingArtilleryProjectileWorldExitContactV1"
  );


const PROJECTILE_WORLD_EXIT_KIND_V1 =
  Object.freeze({
    BOUNDARY_EXIT:
      "boundary_exit",

    ALREADY_OUTSIDE:
      "already_outside",
  });


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_PROJECTILE_WORLD_EXIT_CLASSIFICATION_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertTrajectorySegmentEnvelope(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    throw buildError({
      message:
        "Projectile world exit classification Cing Artillery thiếu trajectory_segment",
    });
  }


  return value;
}


function classifyProjectileWorldExitV1({
  trajectorySegment,
  projectileRadiusScaled,
  physicsFixedScale,
  widthPx,
  heightPx,
} = {}) {
  const segment =
    assertTrajectorySegmentEnvelope(
      trajectorySegment
    );


  /*
   * Compute the canonical parameter through the already
   * locked world-exit contact authority first.
   *
   * This deliberately preserves its validation semantics
   * and avoids creating a second exit calculation.
   */
  const contactParameter =
    projectileWorldExitContactV1({
      trajectorySegment:
        segment,

      projectileRadiusScaled,
      physicsFixedScale,
      widthPx,
      heightPx,
    });


  if (
    contactParameter ===
      null
  ) {
    return null;
  }


  /*
   * Semantic classification requires only knowledge of
   * whether the segment START was inside/on the canonical
   * expanded closed world.
   *
   * Shared bounds remain the single derivation/membership
   * authority.
   */
  const bounds =
    deriveProjectileExpandedWorldBoundsV1({
      projectileRadiusScaled,
      physicsFixedScale,
      widthPx,
      heightPx,
    });


  const startInside =
    pointInsideProjectileExpandedWorldV1({
      xScaled:
        segment.start_x_scaled,

      yScaled:
        segment.start_y_scaled,

      expandedWorldBounds:
        bounds,
    });


  return Object.freeze({
    world_exit_kind:
      startInside
        ? PROJECTILE_WORLD_EXIT_KIND_V1.BOUNDARY_EXIT
        : PROJECTILE_WORLD_EXIT_KIND_V1.ALREADY_OUTSIDE,

    contact_parameter:
      contactParameter,
  });
}


module.exports = {
  PROJECTILE_WORLD_EXIT_KIND_V1,
  classifyProjectileWorldExitV1,
};
