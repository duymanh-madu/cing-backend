"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  DAMAGE_MODE_V1,
  calculateDamageFormulaV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryDamageFormulaV1"
  );


function rules(
  overrides = {}
) {
  return {
    base_damage: {
      numerator:
        300n,

      denominator:
        1n,
    },

    blast_min_damage_ratio: {
      numerator:
        1n,

      denominator:
        10n,
    },

    damage_formula_version:
      1,

    damage_rounding:
      "floor",

    self_damage_enabled:
      false,

    ...overrides,
  };
}


function stats(
  overrides = {}
) {
  return {
    attacker_attack:
      100,

    defender_defense:
      100,

    ...overrides,
  };
}


test(
  "damage modes are explicit and immutable",
  () => {
    assert.ok(
      Object.isFrozen(
        DAMAGE_MODE_V1
      )
    );

    assert.equal(
      DAMAGE_MODE_V1.DIRECT,
      "direct"
    );

    assert.equal(
      DAMAGE_MODE_V1.BLAST,
      "blast"
    );
  }
);


test(
  "equal attack and defense preserve base damage on direct hit",
  () => {
    const result =
      calculateDamageFormulaV1({
        mode:
          DAMAGE_MODE_V1.DIRECT,

        damageRules:
          rules(),

        statBinding:
          stats(),
      });


    assert.equal(
      result.damage,
      300n
    );
  }
);


test(
  "fractional base damage floors only at final boundary",
  () => {
    const result =
      calculateDamageFormulaV1({
        mode:
          DAMAGE_MODE_V1.DIRECT,

        damageRules:
          rules({
            base_damage: {
              numerator:
                601n,

              denominator:
                2n,
            },
          }),

        statBinding:
          stats(),
      });


    assert.equal(
      result.raw_damage_numerator,
      120200n
    );

    assert.equal(
      result.raw_damage_denominator,
      400n
    );

    assert.equal(
      result.damage,
      300n
    );
  }
);


test(
  "attack advantage uses bounded two-A-over-A-plus-D modifier",
  () => {
    const result =
      calculateDamageFormulaV1({
        mode:
          DAMAGE_MODE_V1.DIRECT,

        damageRules:
          rules(),

        statBinding:
          stats({
            attacker_attack:
              200,

            defender_defense:
              100,
          }),
      });


    assert.equal(
      result.damage,
      400n
    );
  }
);


test(
  "defense advantage reduces damage symmetrically",
  () => {
    const result =
      calculateDamageFormulaV1({
        mode:
          DAMAGE_MODE_V1.DIRECT,

        damageRules:
          rules(),

        statBinding:
          stats({
            attacker_attack:
              100,

            defender_defense:
              200,
          }),
      });


    assert.equal(
      result.damage,
      200n
    );
  }
);


test(
  "zero blast distance preserves full modified damage",
  () => {
    const result =
      calculateDamageFormulaV1({
        mode:
          DAMAGE_MODE_V1.BLAST,

        damageRules:
          rules(),

        statBinding:
          stats(),

        distanceFloorScaled:
          0n,

        blastRadiusScaled:
          100n,
      });


    assert.equal(
      result.damage,
      300n
    );
  }
);


test(
  "linear blast falloff applies exactly before final floor",
  () => {
    const result =
      calculateDamageFormulaV1({
        mode:
          DAMAGE_MODE_V1.BLAST,

        damageRules:
          rules(),

        statBinding:
          stats(),

        distanceFloorScaled:
          50n,

        blastRadiusScaled:
          100n,
      });


    assert.equal(
      result.damage,
      150n
    );
  }
);


test(
  "minimum blast ratio clamps linear falloff",
  () => {
    const result =
      calculateDamageFormulaV1({
        mode:
          DAMAGE_MODE_V1.BLAST,

        damageRules:
          rules({
            blast_min_damage_ratio: {
              numerator:
                1n,

              denominator:
                5n,
            },
          }),

        statBinding:
          stats(),

        distanceFloorScaled:
          90n,

        blastRadiusScaled:
          100n,
      });


    assert.equal(
      result.damage,
      60n
    );
  }
);


test(
  "blast radius boundary receives minimum blast damage",
  () => {
    const result =
      calculateDamageFormulaV1({
        mode:
          DAMAGE_MODE_V1.BLAST,

        damageRules:
          rules(),

        statBinding:
          stats(),

        distanceFloorScaled:
          100n,

        blastRadiusScaled:
          100n,
      });


    assert.equal(
      result.damage,
      30n
    );
  }
);


test(
  "fractional base and blast factor compose without intermediate rounding",
  () => {
    const result =
      calculateDamageFormulaV1({
        mode:
          DAMAGE_MODE_V1.BLAST,

        damageRules:
          rules({
            base_damage: {
              numerator:
                601n,

              denominator:
                2n,
            },
          }),

        statBinding:
          stats(),

        distanceFloorScaled:
          25n,

        blastRadiusScaled:
          100n,
      });


    assert.equal(
      result.damage,
      225n
    );
  }
);


test(
  "affected target always receives at least one damage",
  () => {
    const result =
      calculateDamageFormulaV1({
        mode:
          DAMAGE_MODE_V1.DIRECT,

        damageRules:
          rules({
            base_damage: {
              numerator:
                1n,

              denominator:
                10n,
            },
          }),

        statBinding:
          stats(),
      });


    assert.equal(
      result.damage,
      1n
    );
  }
);


test(
  "blast distance outside canonical radius fails closed",
  () => {
    assert.throws(
      () =>
        calculateDamageFormulaV1({
          mode:
            DAMAGE_MODE_V1.BLAST,

          damageRules:
            rules(),

          statBinding:
            stats(),

          distanceFloorScaled:
            101n,

          blastRadiusScaled:
            100n,
        }),
      {
        code:
          "CING_ARTILLERY_DAMAGE_FORMULA_BLAST_RANGE_INVALID_V1",
      }
    );
  }
);


test(
  "negative blast distance and non-positive radius fail closed",
  () => {
    assert.throws(
      () =>
        calculateDamageFormulaV1({
          mode:
            DAMAGE_MODE_V1.BLAST,

          damageRules:
            rules(),

          statBinding:
            stats(),

          distanceFloorScaled:
            -1n,

          blastRadiusScaled:
            100n,
        })
    );


    assert.throws(
      () =>
        calculateDamageFormulaV1({
          mode:
            DAMAGE_MODE_V1.BLAST,

          damageRules:
            rules(),

          statBinding:
            stats(),

          distanceFloorScaled:
            0n,

          blastRadiusScaled:
            0n,
        })
    );
  }
);


test(
  "direct mode rejects blast geometry",
  () => {
    assert.throws(
      () =>
        calculateDamageFormulaV1({
          mode:
            DAMAGE_MODE_V1.DIRECT,

          damageRules:
            rules(),

          statBinding:
            stats(),

          distanceFloorScaled:
            0n,
        }),
      {
        code:
          "CING_ARTILLERY_DAMAGE_FORMULA_DIRECT_GEOMETRY_FORBIDDEN_V1",
      }
    );
  }
);


test(
  "damage semantic version rounding and self-damage must remain canonical",
  () => {
    assert.throws(
      () =>
        calculateDamageFormulaV1({
          mode:
            DAMAGE_MODE_V1.DIRECT,

          damageRules:
            rules({
              damage_formula_version:
                2,
            }),

          statBinding:
            stats(),
        }),
      {
        code:
          "CING_ARTILLERY_DAMAGE_FORMULA_RULES_MISMATCH_V1",
      }
    );


    assert.throws(
      () =>
        calculateDamageFormulaV1({
          mode:
            DAMAGE_MODE_V1.DIRECT,

          damageRules:
            rules({
              damage_rounding:
                "round",
            }),

          statBinding:
            stats(),
        })
    );


    assert.throws(
      () =>
        calculateDamageFormulaV1({
          mode:
            DAMAGE_MODE_V1.DIRECT,

          damageRules:
            rules({
              self_damage_enabled:
                true,
            }),

          statBinding:
            stats(),
        })
    );
  }
);


test(
  "attack and defense must remain positive safe integers",
  () => {
    for (
      const attacker_attack
      of [
        0,
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
      ]
    ) {
      assert.throws(
        () =>
          calculateDamageFormulaV1({
            mode:
              DAMAGE_MODE_V1.DIRECT,

            damageRules:
              rules(),

            statBinding:
              stats({
                attacker_attack,
              }),
          })
      );
    }


    assert.throws(
      () =>
        calculateDamageFormulaV1({
          mode:
            DAMAGE_MODE_V1.DIRECT,

          damageRules:
            rules(),

          statBinding:
            stats({
              defender_defense:
                0,
            }),
        })
    );
  }
);


test(
  "formula output is immutable",
  () => {
    const result =
      calculateDamageFormulaV1({
        mode:
          DAMAGE_MODE_V1.DIRECT,

        damageRules:
          rules(),

        statBinding:
          stats(),
      });


    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);
