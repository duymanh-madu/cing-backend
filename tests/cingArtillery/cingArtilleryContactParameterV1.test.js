"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  CONTACT_PARAMETER_KIND_V1,
  createRationalContactParameterV1,
  createQuadraticLowerRootContactParameterV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryContactParameterV1"
  );


test(
  "rational zero canonicalizes to 0/1",
  () => {
    const result =
      createRationalContactParameterV1({
        numerator:
          0n,

        denominator:
          999n,
      });

    assert.deepEqual(
      result,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          0n,

        denominator:
          1n,
      }
    );

    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);


test(
  "rational one canonicalizes to 1/1",
  () => {
    assert.deepEqual(
      createRationalContactParameterV1({
        numerator:
          999n,

        denominator:
          999n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "rational parameter reduces by exact gcd",
  () => {
    assert.deepEqual(
      createRationalContactParameterV1({
        numerator:
          42n,

        denominator:
          126n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          3n,
      }
    );
  }
);


test(
  "already reduced rational parameter is preserved",
  () => {
    assert.deepEqual(
      createRationalContactParameterV1({
        numerator:
          7n,

        denominator:
          11n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          7n,

        denominator:
          11n,
      }
    );
  }
);


test(
  "rational denominator must be positive",
  () => {
    for (
      const denominator
      of [
        0n,
        -1n,
      ]
    ) {
      assert.throws(
        () =>
          createRationalContactParameterV1({
            numerator:
              0n,

            denominator,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_CONTACT_PARAMETER_V1",
        }
      );
    }
  }
);


test(
  "rational parameter outside closed segment fails closed",
  () => {
    assert.throws(
      () =>
        createRationalContactParameterV1({
          numerator:
            -1n,

          denominator:
            10n,
        }),
      {
        code:
          "CING_ARTILLERY_CONTACT_PARAMETER_OUT_OF_SEGMENT_V1",
      }
    );

    assert.throws(
      () =>
        createRationalContactParameterV1({
          numerator:
            11n,

          denominator:
            10n,
        }),
      {
        code:
          "CING_ARTILLERY_CONTACT_PARAMETER_OUT_OF_SEGMENT_V1",
      }
    );
  }
);


test(
  "rational inputs must be canonical BigInts",
  () => {
    assert.throws(
      () =>
        createRationalContactParameterV1({
          numerator:
            1,

          denominator:
            2n,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_CONTACT_PARAMETER_V1",
      }
    );

    assert.throws(
      () =>
        createRationalContactParameterV1({
          numerator:
            1n,

          denominator:
            2,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_CONTACT_PARAMETER_V1",
      }
    );
  }
);


test(
  "irrational lower quadratic root remains exact algebraic representation",
  () => {
    /*
     * 100t² - 100t + 22 = 0
     *
     * D = 10000 - 8800 = 1200
     *
     * t =
     *
     *   (100 - sqrt(1200)) / 200
     *
     * and sqrt(1200) is irrational.
     */
    const result =
      createQuadraticLowerRootContactParameterV1({
        a:
          100n,

        b:
          -100n,

        discriminant:
          1200n,
      });

    assert.deepEqual(
      result,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT,

        a:
          100n,

        b:
          -100n,

        discriminant:
          1200n,
      }
    );

    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);


test(
  "perfect-square quadratic root canonicalizes to reduced rational",
  () => {
    /*
     * 100t² - 100t + 21 = 0
     *
     * D = 1600
     * sqrt(D) = 40
     *
     * lower root =
     *   (100 - 40) / 200
     *   = 60/200
     *   = 3/10
     */
    assert.deepEqual(
      createQuadraticLowerRootContactParameterV1({
        a:
          100n,

        b:
          -100n,

        discriminant:
          1600n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          3n,

        denominator:
          10n,
      }
    );
  }
);


test(
  "quadratic lower root at exact zero canonicalizes to 0/1",
  () => {
    /*
     * t² - 2t = 0
     *
     * lower root = 0
     */
    assert.deepEqual(
      createQuadraticLowerRootContactParameterV1({
        a:
          1n,

        b:
          -2n,

        discriminant:
          4n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          0n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "quadratic lower root at exact one canonicalizes to 1/1",
  () => {
    /*
     * t² - 2t + 1 = 0
     *
     * lower root = 1
     */
    assert.deepEqual(
      createQuadraticLowerRootContactParameterV1({
        a:
          1n,

        b:
          -2n,

        discriminant:
          0n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "quadratic lower root below zero fails closed",
  () => {
    /*
     * t² + 2t = 0
     *
     * lower root = -2
     */
    assert.throws(
      () =>
        createQuadraticLowerRootContactParameterV1({
          a:
            1n,

          b:
            2n,

          discriminant:
            4n,
        }),
      {
        code:
          "CING_ARTILLERY_CONTACT_PARAMETER_OUT_OF_SEGMENT_V1",
      }
    );
  }
);


test(
  "quadratic lower root above one fails closed",
  () => {
    /*
     * (t - 2)² = 0
     *
     * lower root = 2
     */
    assert.throws(
      () =>
        createQuadraticLowerRootContactParameterV1({
          a:
            1n,

          b:
            -4n,

          discriminant:
            0n,
        }),
      {
        code:
          "CING_ARTILLERY_CONTACT_PARAMETER_OUT_OF_SEGMENT_V1",
      }
    );
  }
);


test(
  "irrational quadratic root just inside upper segment bound is accepted",
  () => {
    /*
     * t =
     *   (4 - sqrt(2)) / 2
     *
     * is > 1, so this fixture must reject.
     *
     * Use instead:
     *
     *   (3 - sqrt(2)) / 2
     *
     * which lies strictly inside [0,1].
     */
    const result =
      createQuadraticLowerRootContactParameterV1({
        a:
          1n,

        b:
          -3n,

        discriminant:
          2n,
      });

    assert.equal(
      result.kind,
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT
    );
  }
);


test(
  "quadratic coefficient and discriminant domain fails closed",
  () => {
    assert.throws(
      () =>
        createQuadraticLowerRootContactParameterV1({
          a:
            0n,

          b:
            0n,

          discriminant:
            0n,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_CONTACT_PARAMETER_V1",
      }
    );

    assert.throws(
      () =>
        createQuadraticLowerRootContactParameterV1({
          a:
            1n,

          b:
            0n,

          discriminant:
            -1n,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_CONTACT_PARAMETER_V1",
      }
    );
  }
);


test(
  "quadratic inputs must remain BigInt",
  () => {
    assert.throws(
      () =>
        createQuadraticLowerRootContactParameterV1({
          a:
            1,

          b:
            -1n,

          discriminant:
            1n,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_CONTACT_PARAMETER_V1",
      }
    );

    assert.throws(
      () =>
        createQuadraticLowerRootContactParameterV1({
          a:
            1n,

          b:
            -1,

          discriminant:
            1n,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_CONTACT_PARAMETER_V1",
      }
    );

    assert.throws(
      () =>
        createQuadraticLowerRootContactParameterV1({
          a:
            1n,

          b:
            -1n,

          discriminant:
            1,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_CONTACT_PARAMETER_V1",
      }
    );
  }
);


test(
  "arbitrarily large rational values reduce exactly",
  () => {
    const factor =
      10n ** 100n;

    assert.deepEqual(
      createRationalContactParameterV1({
        numerator:
          3n *
          factor,

        denominator:
          7n *
          factor,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          3n,

        denominator:
          7n,
      }
    );
  }
);


test(
  "irrational lower root just above zero is accepted by b squared boundary",
  () => {
    /*
     * a = 10
     * b = -4
     * D = 15
     *
     * t =
     *   (4 - sqrt(15)) / 20
     *
     * Since:
     *   b² = 16 > 15
     *
     * root is strictly positive.
     */
    const result =
      createQuadraticLowerRootContactParameterV1({
        a:
          10n,

        b:
          -4n,

        discriminant:
          15n,
      });

    assert.equal(
      result.kind,
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT
    );
  }
);


test(
  "irrational lower root just below zero is rejected by b squared boundary",
  () => {
    /*
     * a = 10
     * b = -3
     * D = 10
     *
     * t =
     *   (3 - sqrt(10)) / 20
     *
     * Since:
     *   b² = 9 < 10
     *
     * root is strictly negative.
     */
    assert.throws(
      () =>
        createQuadraticLowerRootContactParameterV1({
          a:
            10n,

          b:
            -3n,

          discriminant:
            10n,
        }),
      {
        code:
          "CING_ARTILLERY_CONTACT_PARAMETER_OUT_OF_SEGMENT_V1",
      }
    );
  }
);


test(
  "upper-bound branch with positive k accepts when discriminant exceeds k squared",
  () => {
    /*
     * a = 2
     * b = -7
     *
     * k =
     *   -b - 2a
     *   = 7 - 4
     *   = 3
     *
     * D = 10 > k² = 9
     *
     * t =
     *   (7 - sqrt(10)) / 4
     *
     * lies strictly below 1.
     */
    const result =
      createQuadraticLowerRootContactParameterV1({
        a:
          2n,

        b:
          -7n,

        discriminant:
          10n,
      });

    assert.equal(
      result.kind,
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT
    );
  }
);


test(
  "upper-bound branch with positive k rejects when discriminant is below k squared",
  () => {
    /*
     * a = 2
     * b = -7
     * k = 3
     *
     * D = 8 < k² = 9
     *
     * t =
     *   (7 - sqrt(8)) / 4
     *
     * lies strictly above 1.
     */
    assert.throws(
      () =>
        createQuadraticLowerRootContactParameterV1({
          a:
            2n,

          b:
            -7n,

          discriminant:
            8n,
        }),
      {
        code:
          "CING_ARTILLERY_CONTACT_PARAMETER_OUT_OF_SEGMENT_V1",
      }
    );
  }
);


test(
  "upper-bound equality canonicalizes exact t one",
  () => {
    /*
     * a = 2
     * b = -7
     * k = 3
     * D = k² = 9
     *
     * t =
     *   (7 - 3) / 4
     *   = 1
     */
    assert.deepEqual(
      createQuadraticLowerRootContactParameterV1({
        a:
          2n,

        b:
          -7n,

        discriminant:
          9n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "upper-bound branch with non-positive k accepts without squaring requirement",
  () => {
    /*
     * a = 2
     * b = -4
     *
     * k =
     *   -b - 2a
     *   = 0
     *
     * t =
     *   (4 - sqrt(15)) / 4
     *
     * lies strictly inside [0,1].
     *
     * This exercises the k <= 0 branch directly.
     */
    const result =
      createQuadraticLowerRootContactParameterV1({
        a:
          2n,

        b:
          -4n,

        discriminant:
          15n,
      });

    assert.equal(
      result.kind,
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT
    );
  }
);
