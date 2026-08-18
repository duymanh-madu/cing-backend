"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * COLLISION VS WORLD EXIT PRECEDENCE V1
 *
 * Exact semantic arbitration between:
 *
 *   collision
 *
 *     {
 *       collision_kind:
 *         "player" | "terrain",
 *
 *       contact_parameter:
 *         ContactParameterV1
 *     }
 *
 * and:
 *
 *   world exit
 *
 *     {
 *       world_exit_kind:
 *         "boundary_exit" | "already_outside",
 *
 *       contact_parameter:
 *         ContactParameterV1
 *     }
 *
 * Return:
 *
 *   null
 *
 * or immutable:
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
 * -------------------------------------------------------
 * PRECEDENCE
 * -------------------------------------------------------
 *
 * already_outside:
 *
 *   world exit wins immediately.
 *
 * boundary_exit:
 *
 *   collision < world exit
 *     -> collision
 *
 *   world exit < collision
 *     -> world exit
 *
 *   collision == world exit
 *     -> collision
 *
 * Exact boundary ties belong to collision because the
 * projectile circle still touches the CLOSED world at the
 * boundary parameter.
 *
 * already_outside intentionally does NOT use that tie rule:
 * it means the segment began after the projectile had
 * completely left the expanded world.
 *
 * This module does NOT:
 *
 *   calculate collision geometry
 *   calculate world-exit geometry
 *   inspect map masks
 *   inspect player colliders
 *   produce player_hit / terrain_hit / out_of_bounds
 *   calculate impact
 *   calculate target or damage
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

const {
  PLAYER_TERRAIN_COLLISION_KIND_V1,
} =
  require(
    "./cingArtilleryPlayerTerrainCollisionPrecedenceV1"
  );

const {
  PROJECTILE_WORLD_EXIT_KIND_V1,
} =
  require(
    "./cingArtilleryProjectileWorldExitClassificationV1"
  );


const COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1 =
  Object.freeze({
    COLLISION:
      "collision",

    WORLD_EXIT:
      "world_exit",
  });


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_COLLISION_WORLD_EXIT_PRECEDENCE_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertCanonicalContactParameter(
  value,
  field
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    throw buildError({
      message:
        `Collision/world-exit precedence Cing Artillery thiếu ${field}`,
    });
  }


  try {
    compareContactParametersV1(
      value,
      value
    );
  } catch (error) {
    throw buildError({
      message:
        `Collision/world-exit precedence Cing Artillery có ${field} không canonical`,
    });
  }


  return value;
}


function normalizeCollision(
  value
) {
  if (
    value ===
      null
  ) {
    return null;
  }


  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    throw buildError({
      message:
        "Collision/world-exit precedence Cing Artillery có collision không hợp lệ",
    });
  }


  if (
    value.collision_kind !==
      PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER &&
    value.collision_kind !==
      PLAYER_TERRAIN_COLLISION_KIND_V1.TERRAIN
  ) {
    throw buildError({
      message:
        "Collision/world-exit precedence Cing Artillery có collision_kind không hợp lệ",
    });
  }


  return {
    collision_kind:
      value.collision_kind,

    contact_parameter:
      assertCanonicalContactParameter(
        value.contact_parameter,
        "collision.contact_parameter"
      ),
  };
}


function normalizeWorldExit(
  value
) {
  if (
    value ===
      null
  ) {
    return null;
  }


  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    throw buildError({
      message:
        "Collision/world-exit precedence Cing Artillery có world_exit không hợp lệ",
    });
  }


  if (
    value.world_exit_kind !==
      PROJECTILE_WORLD_EXIT_KIND_V1.BOUNDARY_EXIT &&
    value.world_exit_kind !==
      PROJECTILE_WORLD_EXIT_KIND_V1.ALREADY_OUTSIDE
  ) {
    throw buildError({
      message:
        "Collision/world-exit precedence Cing Artillery có world_exit_kind không hợp lệ",
    });
  }


  const contactParameter =
    assertCanonicalContactParameter(
      value.contact_parameter,
      "world_exit.contact_parameter"
    );


  if (
    value.world_exit_kind ===
      PROJECTILE_WORLD_EXIT_KIND_V1.ALREADY_OUTSIDE
  ) {
    if (
      contactParameter.kind !==
        "rational" ||
      contactParameter.numerator !==
        0n ||
      contactParameter.denominator !==
        1n
    ) {
      throw buildError({
        message:
          "Collision/world-exit precedence Cing Artillery yêu cầu already_outside có contact_parameter = 0/1",
        code:
          "CING_ARTILLERY_COLLISION_WORLD_EXIT_PRECEDENCE_INVARIANT_V1",
      });
    }
  }


  return {
    world_exit_kind:
      value.world_exit_kind,

    contact_parameter:
      contactParameter,
  };
}


function buildCollisionResult(
  collision
) {
  return Object.freeze({
    segment_event_kind:
      COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.COLLISION,

    collision_kind:
      collision.collision_kind,

    world_exit_kind:
      null,

    contact_parameter:
      collision.contact_parameter,
  });
}


function buildWorldExitResult(
  worldExit
) {
  return Object.freeze({
    segment_event_kind:
      COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.WORLD_EXIT,

    collision_kind:
      null,

    world_exit_kind:
      worldExit.world_exit_kind,

    contact_parameter:
      worldExit.contact_parameter,
  });
}


function resolveCollisionWorldExitPrecedenceV1({
  collision,
  worldExit,
} = {}) {
  const normalizedCollision =
    normalizeCollision(
      collision ??
      null
    );

  const normalizedWorldExit =
    normalizeWorldExit(
      worldExit ??
      null
    );


  if (
    normalizedCollision ===
      null &&
    normalizedWorldExit ===
      null
  ) {
    return null;
  }


  if (
    normalizedWorldExit ===
      null
  ) {
    return buildCollisionResult(
      normalizedCollision
    );
  }


  if (
    normalizedCollision ===
      null
  ) {
    return buildWorldExitResult(
      normalizedWorldExit
    );
  }


  if (
    normalizedWorldExit.world_exit_kind ===
      PROJECTILE_WORLD_EXIT_KIND_V1.ALREADY_OUTSIDE
  ) {
    return buildWorldExitResult(
      normalizedWorldExit
    );
  }


  const comparison =
    compareContactParametersV1(
      normalizedCollision.contact_parameter,
      normalizedWorldExit.contact_parameter
    );


  /*
   * Collision wins:
   *
   *   - when earlier
   *   - on exact boundary tie
   *
   * because boundary_exit marks the final parameter where
   * the projectile circle still touches the closed world.
   */
  if (
    comparison <= 0
  ) {
    return buildCollisionResult(
      normalizedCollision
    );
  }


  return buildWorldExitResult(
    normalizedWorldExit
  );
}


module.exports = {
  COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1,
  resolveCollisionWorldExitPrecedenceV1,
};
