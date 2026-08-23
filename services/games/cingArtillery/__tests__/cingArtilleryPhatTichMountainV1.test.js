"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const crypto =
  require("node:crypto");

const {
  MAP_KEY,
  MAP_VERSION,
  DISPLAY_NAME,
  WIDTH_PX,
  HEIGHT_PX,
  COLLISION_FORMAT,
  RENDER_ASSET_KEY,

  surfaceY,
  bytesPerRow,
  isSolid,
  buildCollisionMask,
  buildSpawnPairs,
  buildMapContentV1,
} =
  require(
    "../content/maps/phatTichMountainV1"
  );


function sha256(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      value
    )
    .digest(
      "hex"
    );
}


/*
 * Checks a straight low-angle corridor between two points.
 *
 * This is NOT projectile physics.
 *
 * It is a content-design property test proving the terrain
 * physically blocks a direct low corridor and therefore
 * forces arc selection / terrain strategy.
 */
function straightCorridorBlocked({
  fromX,
  fromY,
  toX,
  toY,
}) {
  const minX =
    Math.min(
      fromX,
      toX
    );

  const maxX =
    Math.max(
      fromX,
      toX
    );

  const span =
    toX -
    fromX;

  if (span === 0) {
    throw new Error(
      "invalid vertical corridor"
    );
  }

  for (
    let x =
      minX + 1;
    x < maxX;
    x += 1
  ) {
    const numerator =
      (
        (x - fromX) *
        (toY - fromY)
      );

    const projectedY =
      fromY +
      Math.floor(
        numerator /
        span
      );

    if (
      projectedY >=
      surfaceY(x)
    ) {
      return true;
    }
  }

  return false;
}


/*
 * Piecewise arch used ONLY as a geometry/content assertion.
 *
 * It proves that the map does not seal the two sides with
 * an impossible wall.
 *
 * It is deliberately NOT the gameplay trajectory solver.
 */
function authoredHighArcClears({
  fromX,
  fromY,
  toX,
  toY,
  apexY,
}) {
  const centerX =
    Math.floor(
      (
        fromX +
        toX
      ) /
      2
    );

  for (
    let x =
      fromX + 1;
    x < toX;
    x += 1
  ) {
    let y;

    if (
      x <= centerX
    ) {
      y =
        fromY +
        Math.floor(
          (
            (x - fromX) *
            (apexY - fromY)
          ) /
          (
            centerX -
            fromX
          )
        );
    } else {
      y =
        apexY +
        Math.floor(
          (
            (x - centerX) *
            (toY - apexY)
          ) /
          (
            toX -
            centerX
          )
        );
    }

    if (
      y >=
      surfaceY(x)
    ) {
      return false;
    }
  }

  return true;
}


test(
  "Phat Tich Mountain owns exact production identity",
  () => {
    assert.equal(
      MAP_KEY,
      "phat-tich-mountain"
    );

    assert.equal(
      MAP_VERSION,
      1
    );

    assert.equal(
      DISPLAY_NAME,
      "Núi Phật Tích"
    );

    assert.equal(
      WIDTH_PX,
      960
    );

    assert.equal(
      HEIGHT_PX,
      540
    );

    assert.equal(
      COLLISION_FORMAT,
      "bitmask_v1"
    );

    assert.equal(
      RENDER_ASSET_KEY,
      "/game-assets/cing-piu-piu/maps/phat-tich-mountain/v1/map.svg"
    );
  }
);


test(
  "collision mask uses exact scanline-aligned MSB bitmask dimensions",
  () => {
    assert.equal(
      bytesPerRow(),
      120
    );

    const collisionMask =
      buildCollisionMask();

    assert.equal(
      collisionMask.length,
      120 * 540
    );
  }
);


test(
  "collision generation is byte-for-byte deterministic",
  () => {
    const first =
      buildCollisionMask();

    const second =
      buildCollisionMask();

    assert.ok(
      first.equals(
        second
      )
    );

    assert.equal(
      sha256(first),
      sha256(second)
    );
  }
);


test(
  "every surface column obeys canonical PostgreSQL surface semantics",
  () => {
    const collisionMask =
      buildCollisionMask();

    for (
      let x = 0;
      x < WIDTH_PX;
      x += 1
    ) {
      const y =
        surfaceY(x);

      assert.equal(
        isSolid({
          collisionMask,
          x,
          y,
        }),
        true,
        `surface must be solid at x=${x}`
      );

      assert.equal(
        isSolid({
          collisionMask,
          x,
          y:
            y - 1,
        }),
        false,
        `pixel above surface must be empty at x=${x}`
      );
    }
  }
);


test(
  "vertical combat range is materially large",
  () => {
    const elevations =
      Array.from(
        {
          length:
            WIDTH_PX,
        },
        (
          _,
          x
        ) =>
          surfaceY(x)
      );

    const highest =
      Math.min(
        ...elevations
      );

    const lowest =
      Math.max(
        ...elevations
      );

    assert.ok(
      (
        lowest -
        highest
      ) >= 110,
      "vertical range is too shallow for vertical-artillery identity"
    );
  }
);


test(
  "terrain is materially asymmetric rather than a mirrored firing puzzle",
  () => {
    let asymmetricColumns =
      0;

    for (
      let x = 0;
      x < WIDTH_PX;
      x += 1
    ) {
      const mirrorX =
        WIDTH_PX -
        1 -
        x;

      if (
        surfaceY(x) !==
        surfaceY(
          mirrorX
        )
      ) {
        asymmetricColumns +=
          1;
      }
    }

    assert.ok(
      asymmetricColumns >=
        360,
      "terrain is not asymmetric enough"
    );
  }
);


test(
  "central ridge is a genuine high obstacle",
  () => {
    const centralHigh =
      Math.min(
        ...[
          surfaceY(430),
          surfaceY(455),
          surfaceY(475),
          surfaceY(495),
          surfaceY(520),
        ]
      );

    assert.ok(
      centralHigh <=
        290,
      "central ridge is not sufficiently high"
    );

    assert.ok(
      surfaceY(350) -
        centralHigh >=
        90,
      "left approach does not create strong vertical obstruction"
    );

    assert.ok(
      surfaceY(615) -
        centralHigh >=
        100,
      "right approach does not create strong vertical obstruction"
    );
  }
);


test(
  "three ranked openings have distinct horizontal and vertical geometry",
  () => {
    const pairs =
      buildSpawnPairs();

    assert.equal(
      pairs.length,
      3
    );

    const horizontalDistances =
      new Set(
        pairs.map(
          (
            pair
          ) =>
            Math.abs(
              pair.side_b_x -
              pair.side_a_x
            )
        )
      );

    assert.equal(
      horizontalDistances.size,
      3,
      "spawn openings reuse horizontal distance"
    );

    const signatures =
      new Set(
        pairs.map(
          (
            pair
          ) =>
            [
              pair.side_a_y,
              pair.side_b_y,
              Math.abs(
                pair.side_b_x -
                pair.side_a_x
              ),
            ].join(":")
        )
      );

    assert.equal(
      signatures.size,
      3,
      "spawn openings are not materially distinct"
    );
  }
);


test(
  "all spawn anchors satisfy authoritative surface rules",
  () => {
    const collisionMask =
      buildCollisionMask();

    const pairs =
      buildSpawnPairs();

    for (
      const pair
      of pairs
    ) {
      for (
        const side
        of [
          "a",
          "b",
        ]
      ) {
        const x =
          pair[
            `side_${side}_x`
          ];

        const y =
          pair[
            `side_${side}_y`
          ];

        assert.equal(
          isSolid({
            collisionMask,
            x,
            y,
          }),
          true
        );

        assert.equal(
          isSolid({
            collisionMask,
            x,
            y:
              y - 1,
          }),
          false
        );
      }
    }
  }
);


test(
  "every ranked opening blocks trivial direct low-angle corridor",
  () => {
    const pairs =
      buildSpawnPairs();

    for (
      const pair
      of pairs
    ) {
      const blocked =
        straightCorridorBlocked({
          fromX:
            pair.side_a_x,
          fromY:
            pair.side_a_y -
            1,
          toX:
            pair.side_b_x,
          toY:
            pair.side_b_y -
            1,
        });

      assert.equal(
        blocked,
        true,
        `${pair.spawn_key} permits trivial straight corridor`
      );
    }
  }
);


test(
  "every ranked opening owns at least one deterministic viable high-arc corridor",
  () => {
    const pairs =
      buildSpawnPairs();

    /*
     * These are authored geometry probes only.
     *
     * They do NOT represent gameplay shot solutions.
     * They prove that each opening has at least one
     * sufficiently elevated unobstructed corridor through
     * the static terrain geometry.
     */
    const candidateApexYValues =
      Object.freeze([
        180,
        160,
        140,
        120,
        100,
        80,
      ]);

    for (
      const pair
      of pairs
    ) {
      const viableApexY =
        candidateApexYValues.find(
          (
            apexY
          ) =>
            authoredHighArcClears({
              fromX:
                pair.side_a_x,
              fromY:
                pair.side_a_y -
                1,
              toX:
                pair.side_b_x,
              toY:
                pair.side_b_y -
                1,
              apexY,
            })
        );

      assert.notEqual(
        viableApexY,
        undefined,
        `${pair.spawn_key} has no deterministic viable high-arc corridor`
      );

      assert.ok(
        viableApexY <= 180,
        `${pair.spawn_key} requires implausibly low arc probe`
      );
    }
  }
);


test(
  "map content collision hash owns exact collision bytes",
  () => {
    const map =
      buildMapContentV1();

    assert.match(
      map.collisionMaskSha256,
      /^[0-9a-f]{64}$/
    );

    assert.equal(
      map.collisionMaskSha256,
      sha256(
        map.collisionMask
      )
    );
  }
);
