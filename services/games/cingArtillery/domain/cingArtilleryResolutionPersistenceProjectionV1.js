"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * RESOLUTION PERSISTENCE PROJECTION V1
 *
 * Purpose:
 *
 *   project canonical in-memory shot resolution values into
 *   PostgreSQL-safe scalar transport representation.
 *
 * This layer owns SERIALIZATION only.
 *
 * It does NOT:
 *
 *   create resolution identity
 *   choose execution / command / combat / turn identity
 *   call RPC
 *   write PostgreSQL
 *   mutate HP
 *   complete execution
 *   advance turn
 *   complete combat
 *   emit realtime
 *
 * BigInt persistence boundary:
 *
 *   BigInt
 *     ->
 *   canonical plain base-10 integer string
 *
 * No Number conversion.
 * No exponent notation.
 * No JSON BigInt serialization.
 */

const {
  CONTACT_PARAMETER_KIND_V1,
  createRationalContactParameterV1,
  createQuadraticLowerRootContactParameterV1,
} =
  require(
    "./cingArtilleryContactParameterV1"
  );

const {
  SEGMENT_CONTACT_POINT_KIND_V1,
} =
  require(
    "./cingArtillerySegmentContactPointV1"
  );


const RESOLUTION_PERSISTENCE_OUTCOME_V1 =
  Object.freeze({
    PLAYER_HIT:
      "player_hit",

    TERRAIN_HIT:
      "terrain_hit",

    OUT_OF_BOUNDS:
      "out_of_bounds",

    FLIGHT_HORIZON_EXHAUSTED:
      "flight_horizon_exhausted",
  });


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_RESOLUTION_PERSISTENCE_PROJECTION_V1",
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
        `Resolution persistence projection Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function assertPositiveSafeInteger(
  value,
  field
) {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value
    ) ||
    value <=
      0
  ) {
    throw buildError({
      message:
        `Resolution persistence projection Cing Artillery yêu cầu ${field} là positive safe integer`,
    });
  }

  return value;
}


function serializeBigIntDecimal(
  value,
  field
) {
  if (
    typeof value !==
      "bigint"
  ) {
    throw buildError({
      message:
        `Resolution persistence projection Cing Artillery yêu cầu ${field} là BigInt`,
    });
  }

  return value.toString(10);
}


function serializeNonNegativeBigIntDecimal(
  value,
  field
) {
  if (
    typeof value !==
      "bigint" ||
    value <
      0n
  ) {
    throw buildError({
      message:
        `Resolution persistence projection Cing Artillery yêu cầu ${field} là BigInt không âm`,
    });
  }

  return value.toString(10);
}


function assertNullableAccountId(
  value
) {
  if (
    value ===
      null
  ) {
    return null;
  }

  if (
    typeof value !==
      "string" ||
    value.trim() ===
      ""
  ) {
    throw buildError({
      message:
        "Resolution persistence projection Cing Artillery có target_account_id không hợp lệ",
    });
  }

  return value;
}


function assertCanonicalDecimalString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(
      value
    )
  ) {
    throw buildError({
      message:
        `Resolution persistence projection Cing Artillery có ${field} không phải canonical non-negative decimal string`,
    });
  }

  return value;
}


function assertOutcome(
  value
) {
  if (
    !Object.values(
      RESOLUTION_PERSISTENCE_OUTCOME_V1
    ).includes(
      value
    )
  ) {
    throw buildError({
      message:
        "Resolution persistence projection Cing Artillery có outcome không hỗ trợ",
      code:
        "CING_ARTILLERY_RESOLUTION_PERSISTENCE_OUTCOME_UNSUPPORTED_V1",
    });
  }

  return value;
}


function normalizeCanonicalContactParameter(
  parameter
) {
  const value =
    assertObject(
      parameter,
      "exact_impact.contact_parameter"
    );

  if (
    value.kind ===
      CONTACT_PARAMETER_KIND_V1.RATIONAL
  ) {
    const canonical =
      createRationalContactParameterV1({
        numerator:
          value.numerator,

        denominator:
          value.denominator,
      });

    if (
      canonical.kind !==
        value.kind ||
      canonical.numerator !==
        value.numerator ||
      canonical.denominator !==
        value.denominator
    ) {
      throw buildError({
        message:
          "Resolution persistence projection Cing Artillery nhận rational contact parameter không canonical",
        code:
          "CING_ARTILLERY_RESOLUTION_PERSISTENCE_CONTACT_NONCANONICAL_V1",
      });
    }

    return canonical;
  }

  if (
    value.kind ===
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT
  ) {
    const canonical =
      createQuadraticLowerRootContactParameterV1({
        a:
          value.a,

        b:
          value.b,

        discriminant:
          value.discriminant,
      });

    if (
      canonical.kind !==
        CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT ||
      canonical.a !==
        value.a ||
      canonical.b !==
        value.b ||
      canonical.discriminant !==
        value.discriminant
    ) {
      throw buildError({
        message:
          "Resolution persistence projection Cing Artillery nhận quadratic contact parameter không canonical",
        code:
          "CING_ARTILLERY_RESOLUTION_PERSISTENCE_CONTACT_NONCANONICAL_V1",
      });
    }

    return canonical;
  }

  throw buildError({
    message:
      "Resolution persistence projection Cing Artillery có contact parameter kind không hỗ trợ",
  });
}


function projectExactImpact({
  exactImpact,
  physicsFixedScale,
}) {
  const point =
    assertObject(
      exactImpact,
      "exact_impact"
    );

  if (
    point.kind !==
      SEGMENT_CONTACT_POINT_KIND_V1.POINT
  ) {
    throw buildError({
      message:
        "Resolution persistence projection Cing Artillery yêu cầu affine_contact_point",
    });
  }

  const x =
    assertObject(
      point.x_coordinate,
      "exact_impact.x_coordinate"
    );

  const y =
    assertObject(
      point.y_coordinate,
      "exact_impact.y_coordinate"
    );

  if (
    x.kind !==
      SEGMENT_CONTACT_POINT_KIND_V1.COORDINATE ||
    y.kind !==
      SEGMENT_CONTACT_POINT_KIND_V1.COORDINATE
  ) {
    throw buildError({
      message:
        "Resolution persistence projection Cing Artillery có affine coordinate kind không hợp lệ",
    });
  }

  if (
    x.contact_parameter !==
      y.contact_parameter
  ) {
    throw buildError({
      message:
        "Resolution persistence projection Cing Artillery yêu cầu X/Y dùng cùng ContactParameterV1 object",
      code:
        "CING_ARTILLERY_RESOLUTION_PERSISTENCE_CONTACT_IDENTITY_MISMATCH_V1",
    });
  }

  const parameter =
    normalizeCanonicalContactParameter(
      x.contact_parameter
    );

  const base =
    {
      impact_exact_version:
        1,

      impact_physics_fixed_scale:
        String(
          assertPositiveSafeInteger(
            physicsFixedScale,
            "physics_fixed_scale"
          )
        ),

      impact_start_x_scaled:
        serializeBigIntDecimal(
          x.start_scaled,
          "impact_start_x_scaled"
        ),

      impact_start_y_scaled:
        serializeBigIntDecimal(
          y.start_scaled,
          "impact_start_y_scaled"
        ),

      impact_delta_x_scaled:
        serializeBigIntDecimal(
          x.delta_scaled,
          "impact_delta_x_scaled"
        ),

      impact_delta_y_scaled:
        serializeBigIntDecimal(
          y.delta_scaled,
          "impact_delta_y_scaled"
        ),

      impact_contact_kind:
        parameter.kind,

      impact_contact_numerator:
        null,

      impact_contact_denominator:
        null,

      impact_contact_a:
        null,

      impact_contact_b:
        null,

      impact_contact_discriminant:
        null,
    };

  if (
    parameter.kind ===
      CONTACT_PARAMETER_KIND_V1.RATIONAL
  ) {
    base.impact_contact_numerator =
      serializeNonNegativeBigIntDecimal(
        parameter.numerator,
        "impact_contact_numerator"
      );

    base.impact_contact_denominator =
      serializeBigIntDecimal(
        parameter.denominator,
        "impact_contact_denominator"
      );
  } else {
    base.impact_contact_a =
      serializeBigIntDecimal(
        parameter.a,
        "impact_contact_a"
      );

    base.impact_contact_b =
      serializeBigIntDecimal(
        parameter.b,
        "impact_contact_b"
      );

    base.impact_contact_discriminant =
      serializeNonNegativeBigIntDecimal(
        parameter.discriminant,
        "impact_contact_discriminant"
      );
  }

  return Object.freeze(
    base
  );
}


function nullExactImpactProjection() {
  return Object.freeze({
    impact_exact_version:
      null,

    impact_physics_fixed_scale:
      null,

    impact_start_x_scaled:
      null,

    impact_start_y_scaled:
      null,

    impact_delta_x_scaled:
      null,

    impact_delta_y_scaled:
      null,

    impact_contact_kind:
      null,

    impact_contact_numerator:
      null,

    impact_contact_denominator:
      null,

    impact_contact_a:
      null,

    impact_contact_b:
      null,

    impact_contact_discriminant:
      null,
  });
}


function projectNumericImpact(
  numericImpact
) {
  const value =
    assertObject(
      numericImpact,
      "numeric_impact"
    );

  if (
    value.projection_version !==
      1
  ) {
    throw buildError({
      message:
        "Resolution persistence projection Cing Artillery yêu cầu numeric impact projection version 1",
      code:
        "CING_ARTILLERY_RESOLUTION_PERSISTENCE_NUMERIC_PROJECTION_VERSION_INVALID_V1",
    });
  }

  return Object.freeze({
    impact_projection_version:
      1,

    impact_x:
      assertCanonicalDecimalString(
        value.impact_x,
        "impact_x"
      ),

    impact_y:
      assertCanonicalDecimalString(
        value.impact_y,
        "impact_y"
      ),
  });
}


function nullNumericImpactProjection() {
  return Object.freeze({
    impact_projection_version:
      null,

    impact_x:
      null,

    impact_y:
      null,
  });
}


function projectResolutionPersistenceV1({
  canonicalShotDamage,
  physicsVersion,
  physicsFixedScale,
} = {}) {
  const canonical =
    assertObject(
      canonicalShotDamage,
      "canonical_shot_damage"
    );

  const outcome =
    assertOutcome(
      canonical.outcome
    );

  const physics =
    assertPositiveSafeInteger(
      physicsVersion,
      "physics_version"
    );

  const targetAccountId =
    assertNullableAccountId(
      canonical.target_account_id
    );

  const damage =
    serializeNonNegativeBigIntDecimal(
      canonical.damage,
      "damage"
    );

  const collisionOutcome =
    outcome ===
      RESOLUTION_PERSISTENCE_OUTCOME_V1.PLAYER_HIT ||
    outcome ===
      RESOLUTION_PERSISTENCE_OUTCOME_V1.TERRAIN_HIT;

  let exactProjection;
  let numericProjection;

  if (
    collisionOutcome
  ) {
    if (
      canonical.exact_impact ===
        null ||
      canonical.numeric_impact ===
        null
    ) {
      throw buildError({
        message:
          "Resolution persistence projection Cing Artillery collision thiếu impact",
        code:
          "CING_ARTILLERY_RESOLUTION_PERSISTENCE_COLLISION_IMPACT_REQUIRED_V1",
      });
    }

    exactProjection =
      projectExactImpact({
        exactImpact:
          canonical.exact_impact,

        physicsFixedScale,
      });

    numericProjection =
      projectNumericImpact(
        canonical.numeric_impact
      );
  } else {
    if (
      canonical.exact_impact !==
        null ||
      canonical.numeric_impact !==
        null
    ) {
      throw buildError({
        message:
          "Resolution persistence projection Cing Artillery no-impact outcome chứa impact",
        code:
          "CING_ARTILLERY_RESOLUTION_PERSISTENCE_UNEXPECTED_IMPACT_V1",
      });
    }

    if (
      physicsFixedScale !==
        undefined &&
      physicsFixedScale !==
        null
    ) {
      throw buildError({
        message:
          "Resolution persistence projection Cing Artillery no-impact outcome không nhận physics_fixed_scale",
        code:
          "CING_ARTILLERY_RESOLUTION_PERSISTENCE_UNEXPECTED_SCALE_V1",
      });
    }

    exactProjection =
      nullExactImpactProjection();

    numericProjection =
      nullNumericImpactProjection();
  }

  if (
    (
      outcome ===
        RESOLUTION_PERSISTENCE_OUTCOME_V1.PLAYER_HIT &&
      (
        targetAccountId ===
          null ||
        canonical.damage <=
          0n
      )
    ) ||
    (
      outcome ===
        RESOLUTION_PERSISTENCE_OUTCOME_V1.TERRAIN_HIT &&
      (
        (
          targetAccountId ===
            null &&
          canonical.damage !==
            0n
        ) ||
        (
          targetAccountId !==
            null &&
          canonical.damage <=
            0n
        )
      )
    ) ||
    (
      (
        outcome ===
          RESOLUTION_PERSISTENCE_OUTCOME_V1.OUT_OF_BOUNDS ||
        outcome ===
          RESOLUTION_PERSISTENCE_OUTCOME_V1.FLIGHT_HORIZON_EXHAUSTED
      ) &&
      (
        targetAccountId !==
          null ||
        canonical.damage !==
          0n
      )
    )
  ) {
    throw buildError({
      message:
        "Resolution persistence projection Cing Artillery vi phạm durable outcome/target/damage shape",
      code:
        "CING_ARTILLERY_RESOLUTION_PERSISTENCE_OUTCOME_SHAPE_INVALID_V1",
    });
  }

  return Object.freeze({
    physics_version:
      physics,

    outcome,

    ...exactProjection,

    ...numericProjection,

    target_account_id:
      targetAccountId,

    damage,
  });
}


module.exports = {
  RESOLUTION_PERSISTENCE_OUTCOME_V1,
  projectResolutionPersistenceV1,
};
