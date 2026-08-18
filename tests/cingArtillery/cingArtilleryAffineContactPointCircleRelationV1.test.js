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
  createSegmentContactPointV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySegmentContactPointV1"
  );

const {
  AFFINE_CONTACT_POINT_CIRCLE_RELATION_V1,
  classifyAffineContactPointCircleRelationV1,
  affineContactPointInsideCircleV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryAffineContactPointCircleMembershipV1"
  );


function point({
  startX,
  startY,
  endX,
  endY,
  parameter,
}) {
  return createSegmentContactPointV1({
    trajectorySegment: {
      start_x_scaled:
        startX,

      start_y_scaled:
        startY,

      end_x_scaled:
        endX,

      end_y_scaled:
        endY,
    },

    contactParameter:
      parameter,
  });
}


function rational(
  numerator,
  denominator
) {
  return createRationalContactParameterV1({
    numerator,
    denominator,
  });
}


function irrational() {
  return createQuadraticLowerRootContactParameterV1({
    a:
      1n,

    b:
      -2n,

    discriminant:
      2n,
  });
}


function relation(
  exactPoint,
  radius
) {
  return classifyAffineContactPointCircleRelationV1({
    exactPoint,

    circleCenterXScaled:
      0n,

    circleCenterYScaled:
      0n,

    radiusScaled:
      radius,
  });
}


test(
  "relation contract is immutable and explicit",
  () => {
    assert.deepEqual(
      AFFINE_CONTACT_POINT_CIRCLE_RELATION_V1,
      {
        INSIDE:
          "inside",

        TANGENT:
          "tangent",

        OUTSIDE:
          "outside",
      }
    );

    assert.ok(
      Object.isFrozen(
        AFFINE_CONTACT_POINT_CIRCLE_RELATION_V1
      )
    );
  }
);


test(
  "rational point classifies inside tangent and outside exactly",
  () => {
    const exactPoint =
      point({
        startX:
          0n,

        startY:
          0n,

        endX:
          6n,

        endY:
          8n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    assert.equal(
      relation(
        exactPoint,
        6n
      ),
      "inside"
    );

    assert.equal(
      relation(
        exactPoint,
        5n
      ),
      "tangent"
    );

    assert.equal(
      relation(
        exactPoint,
        4n
      ),
      "outside"
    );
  }
);


test(
  "irrational exact tangency is classified tangent",
  () => {
    const exactPoint =
      point({
        startX:
          -1n,

        startY:
          -1n,

        endX:
          0n,

        endY:
          0n,

        parameter:
          irrational(),
      });


    assert.equal(
      relation(
        exactPoint,
        1n
      ),
      "tangent"
    );
  }
);


test(
  "irrational point classifies inside and outside exactly",
  () => {
    const exactPoint =
      point({
        startX:
          0n,

        startY:
          0n,

        endX:
          10n,

        endY:
          0n,

        parameter:
          irrational(),
      });


    assert.equal(
      relation(
        exactPoint,
        3n
      ),
      "inside"
    );

    assert.equal(
      relation(
        exactPoint,
        2n
      ),
      "outside"
    );
  }
);


test(
  "boolean membership remains backward-compatible with relation",
  () => {
    const exactPoint =
      point({
        startX:
          0n,

        startY:
          0n,

        endX:
          6n,

        endY:
          8n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    for (
      const [
        radius,
        expectedRelation,
        expectedMembership,
      ]
      of [
        [
          6n,
          "inside",
          true,
        ],
        [
          5n,
          "tangent",
          true,
        ],
        [
          4n,
          "outside",
          false,
        ],
      ]
    ) {
      assert.equal(
        relation(
          exactPoint,
          radius
        ),
        expectedRelation
      );

      assert.equal(
        affineContactPointInsideCircleV1({
          exactPoint,

          circleCenterXScaled:
            0n,

          circleCenterYScaled:
            0n,

          radiusScaled:
            radius,
        }),
        expectedMembership
      );
    }
  }
);


test(
  "invalid geometry still fails closed through shared authority",
  () => {
    const exactPoint =
      point({
        startX:
          0n,

        startY:
          0n,

        endX:
          1n,

        endY:
          0n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    assert.throws(
      () =>
        classifyAffineContactPointCircleRelationV1({
          exactPoint,

          circleCenterXScaled:
            0,

          circleCenterYScaled:
            0n,

          radiusScaled:
            1n,
        })
    );


    assert.throws(
      () =>
        classifyAffineContactPointCircleRelationV1({
          exactPoint,

          circleCenterXScaled:
            0n,

          circleCenterYScaled:
            0n,

          radiusScaled:
            0n,
        })
    );
  }
);
