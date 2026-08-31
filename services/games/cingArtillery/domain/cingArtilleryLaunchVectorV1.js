"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * LAUNCH VECTOR AUTHORITY V1
 *
 * Purpose:
 *
 *   canonical shot angle
 *     ->
 *   exact trig-angle units
 *     ->
 *   deterministic CORDIC cos/sin
 *     ->
 *   horizontal fire direction
 *     ->
 *   normalized world launch direction
 *
 * World coordinates:
 *
 *   +X = right
 *   +Y = down
 *
 * Physics V1 shot angle:
 *
 *   elevation above local forward horizontal
 *
 * Therefore:
 *
 *   direction_x =
 *     fire_direction_x_sign * cos(angle)
 *
 *   direction_y =
 *     -sin(angle)
 *
 * Output components remain on Trig Algorithm V1's
 * dimensionless value scale.
 *
 * This module intentionally does NOT own:
 *
 *   power
 *   speed
 *   initial velocity
 *   muzzle position
 *   wind
 *   gravity
 *   time integration
 *   trajectory
 *   collision
 *   database state
 */

const {
  normalizeAngleOnGridV1,
} =
  require(
    "./cingArtilleryAngleGridV1"
  );

const {
  convertPhysicsAngleToTrigUnitsV1,
} =
  require(
    "./cingArtilleryTrigRepresentationV1"
  );

const {
  assertTrigAlgorithmV1Contract,
  TRIG_VALUE_SCALE_V1,
} =
  require(
    "./cingArtilleryTrigAlgorithmV1Contract"
  );

const {
  rotateCordicFirstQuadrantV1,
} =
  require(
    "./cingArtilleryCordicRotationV1"
  );

const {
  deriveHorizontalFireDirectionV1,
} =
  require(
    "./cingArtilleryFireDirectionV1"
  );

const {
  CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1,
} =
  require(
    "./cingArtilleryShotAngleConventionV1"
  );


const LAUNCH_DIRECTION_VALUE_SCALE_V1 =
  BigInt(
    TRIG_VALUE_SCALE_V1
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_LAUNCH_VECTOR_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertLaunchConventionIdentityV1() {
  if (
    CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1.reference !==
      "elevation_above_local_forward_horizontal" ||
    CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1.world_x_positive !==
      "right" ||
    CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1.world_y_positive !==
      "down" ||
    CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1.vertical_launch_sign !==
      -1n
  ) {
    throw buildError({
      message:
        "Launch vector Cing Artillery có angle/world convention không nhất quán",
      code:
        "CING_ARTILLERY_LAUNCH_VECTOR_CONVENTION_MISMATCH",
    });
  }
}


function deriveLaunchVectorV1({
  angleDeg,

  angleMinDeg,
  angleMaxDeg,
  angleStepDeg,

  physicsFixedScale,

  trigAlgorithmVersion,
  trigAngleScale,
  trigValueScale,

  shooterX,
  opponentX,
}) {
  assertLaunchConventionIdentityV1();

  /*
   * Enforce exact Trig Algorithm V1 identity before passing
   * converted angle units into the V1 CORDIC kernel.
   */
  assertTrigAlgorithmV1Contract({
    trigAlgorithmVersion,
    trigAngleScale,
    trigValueScale,
  });


  /*
   * Shot angle authority:
   *
   * exact physics lattice
   * exact configured grid membership
   */
  const canonicalAngle =
    normalizeAngleOnGridV1({
      angleDeg,

      angleMinDeg,
      angleMaxDeg,
      angleStepDeg,

      physicsFixedScale,
    });


  /*
   * Exact lattice conversion.
   *
   * No implicit rounding.
   */
  const angleTrigUnits =
    convertPhysicsAngleToTrigUnitsV1({
      angleDegScaled:
        canonicalAngle.angle_deg_scaled,

      physicsFixedScale,
      trigAngleScale,
    });


  /*
   * Local first-quadrant trig.
   */
  const rotation =
    rotateCordicFirstQuadrantV1({
      angleTrigUnits,
    });


  /*
   * Horizontal world orientation derives from canonical current
   * shooter/opponent X positions supplied by runtime authority.
   */
  const fireDirection =
    deriveHorizontalFireDirectionV1({
      shooterX,
      opponentX,
    });


  const directionX =
    fireDirection.x_sign *
    rotation.cos_scaled;

  const directionY =
    CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1
      .vertical_launch_sign *
    rotation.sin_scaled;


  return Object.freeze({
    angle_deg_scaled:
      canonicalAngle.angle_deg_scaled,

    angle_trig_units:
      angleTrigUnits,

    fire_direction:
      fireDirection.direction,

    fire_direction_x_sign:
      fireDirection.x_sign,

    direction_x_scaled:
      directionX,

    direction_y_scaled:
      directionY,

    direction_value_scale:
      LAUNCH_DIRECTION_VALUE_SCALE_V1,

    cordic_residual_angle_units:
      rotation.residual_angle_units,
  });
}


module.exports = {
  LAUNCH_DIRECTION_VALUE_SCALE_V1,
  deriveLaunchVectorV1,
};
