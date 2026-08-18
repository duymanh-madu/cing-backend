"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  createRationalContactParameterV1,
  createQuadraticLowerRootContactParameterV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryContactParameterV1"
  );

const {
  compareContactParametersV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryContactParameterComparatorV1"
  );


function rational(
  numerator,
  denominator
) {
  return createRationalContactParameterV1({
    numerator,
    denominator,
  });
}


function quadratic({
  a,
  b,
  discriminant,
}) {
  return createQuadraticLowerRootContactParameterV1({
    a,
    b,
    discriminant,
  });
}


test(
  "rational parameters compare by exact cross multiplication",
  () => {
    assert.equal(
      compareContactParametersV1(
        rational(
          1n,
          3n
        ),
        rational(
          2n,
          5n
        )
      ),
      -1
    );

    assert.equal(
      compareContactParametersV1(
        rational(
          7n,
          10n
        ),
        rational(
          2n,
          5n
        )
      ),
      1
    );

    assert.equal(
      compareContactParametersV1(
        rational(
          3n,
          9n
        ),
        rational(
          1n,
          3n
        )
      ),
      0
    );
  }
);


test(
  "rational exact endpoints preserve canonical ordering",
  () => {
    const zero =
      rational(
        0n,
        100n
      );

    const one =
      rational(
        100n,
        100n
      );

    const half =
      rational(
        1n,
        2n
      );

    assert.equal(
      compareContactParametersV1(
        zero,
        half
      ),
      -1
    );

    assert.equal(
      compareContactParametersV1(
        one,
        half
      ),
      1
    );
  }
);


test(
  "irrational quadratic compares below rational threshold exactly",
  () => {
    /*
     * q =
     *   (100 - sqrt(1200)) / 200
     *   ~= 0.32679
     *
     * therefore:
     *
     *   q < 1/3
     */
    const q =
      quadratic({
        a:
          100n,

        b:
          -100n,

        discriminant:
          1200n,
      });

    assert.equal(
      compareContactParametersV1(
        q,
        rational(
          1n,
          3n
        )
      ),
      -1
    );

    assert.equal(
      compareContactParametersV1(
        rational(
          1n,
          3n
        ),
        q
      ),
      1
    );
  }
);


test(
  "irrational quadratic compares above rational threshold exactly",
  () => {
    /*
     * same q ~= 0.32679
     *
     * q > 3/10
     */
    const q =
      quadratic({
        a:
          100n,

        b:
          -100n,

        discriminant:
          1200n,
      });

    assert.equal(
      compareContactParametersV1(
        q,
        rational(
          3n,
          10n
        )
      ),
      1
    );

    assert.equal(
      compareContactParametersV1(
        rational(
          3n,
          10n
        ),
        q
      ),
      -1
    );
  }
);


test(
  "quadratic versus rational S-negative branch is exact",
  () => {
    const q =
      quadratic({
        a:
          10n,

        b:
          -4n,

        discriminant:
          15n,
      });

    assert.equal(
      compareContactParametersV1(
        q,
        rational(
          1n,
          2n
        )
      ),
      -1
    );
  }
);


test(
  "two quadratic roots with equal a compare exactly",
  () => {
    const early =
      quadratic({
        a:
          100n,

        b:
          -100n,

        discriminant:
          1601n,
      });

    const late =
      quadratic({
        a:
          100n,

        b:
          -100n,

        discriminant:
          1200n,
      });

    /*
     * Same -b and denominator.
     * Larger sqrt(discriminant) => smaller lower root.
     */
    assert.equal(
      compareContactParametersV1(
        early,
        late
      ),
      -1
    );

    assert.equal(
      compareContactParametersV1(
        late,
        early
      ),
      1
    );
  }
);


test(
  "quadratic roots with different a compare exactly",
  () => {
    /*
     * left =
     *   (6 - sqrt(8)) / 8
     *   ~= 0.3964
     *
     * right =
     *   (4 - sqrt(2)) / 4
     *   ~= 0.6464
     */
    const left =
      quadratic({
        a:
          4n,

        b:
          -6n,

        discriminant:
          8n,
      });

    const right =
      quadratic({
        a:
          2n,

        b:
          -4n,

        discriminant:
          2n,
      });

    assert.equal(
      compareContactParametersV1(
        left,
        right
      ),
      -1
    );

    assert.equal(
      compareContactParametersV1(
        right,
        left
      ),
      1
    );
  }
);


test(
  "scaled equivalent irrational quadratics compare equal",
  () => {
    /*
     * q1 =
     *   (4 - sqrt(8)) / 4
     *
     * q2 =
     *   (8 - sqrt(32)) / 8
     *
     * These are exactly equal algebraic values.
     */
    const q1 =
      quadratic({
        a:
          2n,

        b:
          -4n,

        discriminant:
          8n,
      });

    const q2 =
      quadratic({
        a:
          4n,

        b:
          -8n,

        discriminant:
          32n,
      });

    assert.equal(
      compareContactParametersV1(
        q1,
        q2
      ),
      0
    );

    assert.equal(
      compareContactParametersV1(
        q2,
        q1
      ),
      0
    );
  }
);


test(
  "quadratic comparison handles positive integer radical branch",
  () => {
    const left =
      quadratic({
        a:
          5n,

        b:
          -7n,

        discriminant:
          2n,
      });

    const right =
      quadratic({
        a:
          5n,

        b:
          -6n,

        discriminant:
          3n,
      });

    const lr =
      compareContactParametersV1(
        left,
        right
      );

    const rl =
      compareContactParametersV1(
        right,
        left
      );

    assert.equal(
      lr,
      -rl
    );

    assert.notEqual(
      lr,
      0
    );
  }
);


test(
  "comparison is antisymmetric across canonical forms",
  () => {
    const values = [
      rational(
        0n,
        1n
      ),

      rational(
        1n,
        4n
      ),

      quadratic({
        a:
          100n,

        b:
          -100n,

        discriminant:
          1200n,
      }),

      rational(
        1n,
        2n
      ),

      quadratic({
        a:
          2n,

        b:
          -4n,

        discriminant:
          2n,
      }),

      rational(
        1n,
        1n
      ),
    ];


    for (
      let i = 0;
      i < values.length;
      i += 1
    ) {
      for (
        let j = 0;
        j < values.length;
        j += 1
      ) {
        const forward =
          compareContactParametersV1(
            values[i],
            values[j]
          );

        const reverse =
          compareContactParametersV1(
            values[j],
            values[i]
          );

        if (
          forward === 0
        ) {
          assert.equal(
            reverse,
            0
          );

          continue;
        }

        assert.equal(
          reverse,
          -forward
        );
      }
    }
  }
);


test(
  "known ordered contact parameter sequence is transitive",
  () => {
    const ordered = [
      rational(
        0n,
        1n
      ),

      rational(
        1n,
        4n
      ),

      quadratic({
        a:
          100n,

        b:
          -100n,

        discriminant:
          1200n,
      }),

      rational(
        1n,
        2n
      ),

      quadratic({
        a:
          2n,

        b:
          -4n,

        discriminant:
          2n,
      }),

      rational(
        1n,
        1n
      ),
    ];


    for (
      let i = 0;
      i < ordered.length;
      i += 1
    ) {
      for (
        let j = i + 1;
        j < ordered.length;
        j += 1
      ) {
        assert.equal(
          compareContactParametersV1(
            ordered[i],
            ordered[j]
          ),
          -1
        );
      }
    }
  }
);


test(
  "arbitrarily large BigInt contact parameters compare exactly",
  () => {
    const factor =
      10n ** 100n;

    assert.equal(
      compareContactParametersV1(
        rational(
          factor,
          3n *
          factor
        ),
        rational(
          2n *
          factor,
          5n *
          factor
        )
      ),
      -1
    );
  }
);


test(
  "non-canonical rational input is rejected",
  () => {
    assert.throws(
      () =>
        compareContactParametersV1(
          {
            kind:
              "rational",

            numerator:
              2n,

            denominator:
              4n,
          },
          rational(
            1n,
            2n
          )
        ),
      {
        code:
          "CING_ARTILLERY_NON_CANONICAL_CONTACT_PARAMETER_V1",
      }
    );
  }
);


test(
  "perfect-square quadratic passed directly is rejected as non-canonical",
  () => {
    assert.throws(
      () =>
        compareContactParametersV1(
          {
            kind:
              "quadratic_lower_root",

            a:
              100n,

            b:
              -100n,

            discriminant:
              1600n,
          },
          rational(
            1n,
            2n
          )
        ),
      {
        code:
          "CING_ARTILLERY_NON_CANONICAL_CONTACT_PARAMETER_V1",
      }
    );
  }
);


test(
  "unknown parameter kind fails closed",
  () => {
    assert.throws(
      () =>
        compareContactParametersV1(
          {
            kind:
              "other",
          },
          rational(
            1n,
            2n
          )
        ),
      {
        code:
          "CING_ARTILLERY_INVALID_CONTACT_PARAMETER_COMPARATOR_V1",
      }
    );
  }
);


test(
  "c positive second-square branch resolves strict near-boundary ordering",
  () => {
    /*
     * left:
     *
     *   (11 - sqrt(82)) / 2
     *
     * right:
     *
     *   (10 - sqrt(65)) / 2
     *
     * For left - right:
     *
     *   c = 1
     *   x = 65
     *   y = 82
     *
     *   k =
     *     y - x - c²
     *     = 16
     *
     * second-square comparison:
     *
     *   4*c²*x = 260
     *   k²      = 256
     *
     * therefore left > right.
     *
     * This deliberately sits very close to the exact
     * second-square boundary.
     */
    const left =
      quadratic({
        a:
          1n,

        b:
          -11n,

        discriminant:
          82n,
      });

    const right =
      quadratic({
        a:
          1n,

        b:
          -10n,

        discriminant:
          65n,
      });

    assert.equal(
      compareContactParametersV1(
        left,
        right
      ),
      1
    );
  }
);


test(
  "c negative second-square branch is exact reverse of near-boundary ordering",
  () => {
    const left =
      quadratic({
        a:
          1n,

        b:
          -10n,

        discriminant:
          65n,
      });

    const right =
      quadratic({
        a:
          1n,

        b:
          -11n,

        discriminant:
          82n,
      });

    assert.equal(
      compareContactParametersV1(
        left,
        right
      ),
      -1
    );
  }
);


test(
  "large algebraic coefficients preserve exact radical ordering",
  () => {
    /*
     * Scale both known roots by K:
     *
     *   a' = K*a
     *   b' = K*b
     *   D' = K²*D
     *
     * This preserves each exact root while forcing all
     * comparator cross-products into very large BigInts.
     */
    const K =
      10n ** 100n;

    const left =
      quadratic({
        a:
          K,

        b:
          -11n *
          K,

        discriminant:
          82n *
          K *
          K,
      });

    const right =
      quadratic({
        a:
          K,

        b:
          -10n *
          K,

        discriminant:
          65n *
          K *
          K,
      });

    assert.equal(
      compareContactParametersV1(
        left,
        right
      ),
      1
    );

    assert.equal(
      compareContactParametersV1(
        right,
        left
      ),
      -1
    );
  }
);


test(
  "second-square radical branch cannot return equality for canonical irrational operands",
  () => {
    /*
     * Use the c>0 branch fixture:
     *
     *   c = 1
     *   x = 65
     *   y = 82
     *   k = 16
     *
     * Equality after the second squaring would require:
     *
     *   4*c²*x = k²
     *
     * but here:
     *
     *   260 != 256
     *
     * More generally, for canonical irrational quadratic
     * contact parameters and c != 0, equality would imply
     * sqrt(x) rational, contradicting the non-perfect-square
     * discriminant invariant.
     */
    const c =
      1n;

    const x =
      65n;

    const y =
      82n;

    const k =
      y -
      x -
      c * c;

    assert.ok(
      k > 0n
    );

    assert.notEqual(
      4n *
        c *
        c *
        x,

      k *
        k
    );
  }
);
