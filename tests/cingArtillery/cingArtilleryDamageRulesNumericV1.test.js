"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  DAMAGE_FORMULA_VERSION_V1,
  DAMAGE_ROUNDING_V1,
  normalizeDamageRulesNumericV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryDamageRulesNumericV1"
  );


function normalize(
  overrides = {}
) {
  return normalizeDamageRulesNumericV1({
    baseDamage:
      300,

    blastMinDamageRatio:
      0.3,

    damageFormulaVersion:
      1,

    damageRounding:
      "floor",

    selfDamageEnabled:
      false,

    ...overrides,
  });
}


test(
  "damage semantic constants are explicit",
  () => {
    assert.equal(
      DAMAGE_FORMULA_VERSION_V1,
      1
    );

    assert.equal(
      DAMAGE_ROUNDING_V1,
      "floor"
    );
  }
);


test(
  "integer base damage becomes exact rational",
  () => {
    const result =
      normalize();


    assert.deepEqual(
      result.base_damage,
      {
        numerator:
          300n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "fractional base damage is preserved rather than rounded",
  () => {
    const result =
      normalize({
        baseDamage:
          300.5,
      });


    assert.deepEqual(
      result.base_damage,
      {
        numerator:
          601n,

        denominator:
          2n,
      }
    );
  }
);


test(
  "blast minimum ratio becomes exact reduced rational",
  () => {
    const result =
      normalize({
        blastMinDamageRatio:
          0.25,
      });


    assert.deepEqual(
      result.blast_min_damage_ratio,
      {
        numerator:
          1n,

        denominator:
          4n,
      }
    );
  }
);


test(
  "canonical Number identity is preserved exactly",
  () => {
    const result =
      normalize({
        blastMinDamageRatio:
          0.30000000000000004,
      });


    assert.deepEqual(
      result.blast_min_damage_ratio,
      {
        numerator:
          7500000000000001n,

        denominator:
          25000000000000000n,
      }
    );
  }
);


test(
  "ratio one is canonical upper boundary",
  () => {
    const result =
      normalize({
        blastMinDamageRatio:
          1,
      });


    assert.deepEqual(
      result.blast_min_damage_ratio,
      {
        numerator:
          1n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "ratio above one fails closed exactly",
  () => {
    assert.throws(
      () =>
        normalize({
          blastMinDamageRatio:
            1.0001,
        }),
      {
        code:
          "CING_ARTILLERY_BLAST_MIN_DAMAGE_RATIO_OUT_OF_RANGE_V1",
      }
    );
  }
);


test(
  "zero and negative base damage fail closed",
  () => {
    for (
      const baseDamage
      of [
        0,
        -1,
        -0.5,
      ]
    ) {
      assert.throws(
        () =>
          normalize({
            baseDamage,
          })
      );
    }
  }
);


test(
  "zero and negative blast ratio fail closed",
  () => {
    for (
      const blastMinDamageRatio
      of [
        0,
        -0.1,
      ]
    ) {
      assert.throws(
        () =>
          normalize({
            blastMinDamageRatio,
          })
      );
    }
  }
);


test(
  "non-finite decimal rules fail closed",
  () => {
    for (
      const value
      of [
        NaN,
        Infinity,
        -Infinity,
      ]
    ) {
      assert.throws(
        () =>
          normalize({
            baseDamage:
              value,
          }),
        {
          code:
            "CING_ARTILLERY_DAMAGE_RULES_DECIMAL_INVALID_V1",
        }
      );


      assert.throws(
        () =>
          normalize({
            blastMinDamageRatio:
              value,
          }),
        {
          code:
            "CING_ARTILLERY_DAMAGE_RULES_DECIMAL_INVALID_V1",
        }
      );
    }
  }
);


test(
  "damage formula version must be exactly one",
  () => {
    for (
      const damageFormulaVersion
      of [
        0,
        2,
        1.5,
        "1",
      ]
    ) {
      assert.throws(
        () =>
          normalize({
            damageFormulaVersion,
          })
      );
    }
  }
);


test(
  "damage rounding must be exactly floor",
  () => {
    for (
      const damageRounding
      of [
        "round",
        "ceil",
        "truncate",
        "FLOOR",
        null,
      ]
    ) {
      assert.throws(
        () =>
          normalize({
            damageRounding,
          })
      );
    }
  }
);


test(
  "self damage must remain disabled",
  () => {
    for (
      const selfDamageEnabled
      of [
        true,
        0,
        1,
        null,
      ]
    ) {
      assert.throws(
        () =>
          normalize({
            selfDamageEnabled,
          })
      );
    }
  }
);


test(
  "outer and nested canonical results are immutable",
  () => {
    const result =
      normalize();


    assert.ok(
      Object.isFrozen(
        result
      )
    );

    assert.ok(
      Object.isFrozen(
        result.base_damage
      )
    );

    assert.ok(
      Object.isFrozen(
        result.blast_min_damage_ratio
      )
    );
  }
);
