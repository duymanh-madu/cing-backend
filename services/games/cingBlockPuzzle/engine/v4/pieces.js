import { nextInt } from "./rng.js";

function freezeCells(cells) {
  return Object.freeze(
    cells.map(([row, col]) =>
      Object.freeze([row, col])
    )
  );
}

function defineShape(
  id,
  cells,
  weight
) {
  if (
    !id ||
    !Array.isArray(cells) ||
    cells.length === 0 ||
    !Number.isSafeInteger(weight) ||
    weight <= 0
  ) {
    throw new Error(
      "invalid block shape"
    );
  }

  return Object.freeze({
    id,
    cells: freezeCells(cells),
    cellCount: cells.length,
    weight,
  });
}

export const PIECE_CATALOG =
  Object.freeze([
    defineShape(
      "dot",
      [[0, 0]],
      5
    ),

    defineShape(
      "line2-h",
      [[0, 0], [0, 1]],
      5
    ),
    defineShape(
      "line2-v",
      [[0, 0], [1, 0]],
      5
    ),

    defineShape(
      "line3-h",
      [[0, 0], [0, 1], [0, 2]],
      4
    ),
    defineShape(
      "line3-v",
      [[0, 0], [1, 0], [2, 0]],
      4
    ),

    defineShape(
      "line4-h",
      [[0, 0], [0, 1], [0, 2], [0, 3]],
      3
    ),
    defineShape(
      "line4-v",
      [[0, 0], [1, 0], [2, 0], [3, 0]],
      3
    ),

    defineShape(
      "line5-h",
      [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
      2
    ),
    defineShape(
      "line5-v",
      [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
      2
    ),

    defineShape(
      "line6-h",
      [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]],
      1
    ),
    defineShape(
      "line6-v",
      [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]],
      1
    ),

    defineShape(
      "square2",
      [
        [0, 0], [0, 1],
        [1, 0], [1, 1],
      ],
      4
    ),

    defineShape(
      "square3",
      [
        [0, 0], [0, 1], [0, 2],
        [1, 0], [1, 1], [1, 2],
        [2, 0], [2, 1], [2, 2],
      ],
      1
    ),

    defineShape(
      "rect2x3",
      [
        [0, 0], [0, 1], [0, 2],
        [1, 0], [1, 1], [1, 2],
      ],
      2
    ),

    defineShape(
      "rect3x2",
      [
        [0, 0], [0, 1],
        [1, 0], [1, 1],
        [2, 0], [2, 1],
      ],
      2
    ),

    defineShape(
      "l3-a",
      [[0, 0], [1, 0], [1, 1]],
      4
    ),
    defineShape(
      "l3-b",
      [[0, 0], [0, 1], [1, 0]],
      4
    ),
    defineShape(
      "l3-c",
      [[0, 0], [0, 1], [1, 1]],
      4
    ),
    defineShape(
      "l3-d",
      [[0, 1], [1, 0], [1, 1]],
      4
    ),

    defineShape(
      "l4-a",
      [[0, 0], [1, 0], [2, 0], [2, 1]],
      3
    ),
    defineShape(
      "l4-b",
      [[0, 0], [0, 1], [0, 2], [1, 0]],
      3
    ),
    defineShape(
      "l4-c",
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      3
    ),
    defineShape(
      "l4-d",
      [[0, 2], [1, 0], [1, 1], [1, 2]],
      3
    ),

    defineShape(
      "l5-a",
      [
        [0, 0],
        [1, 0],
        [2, 0], [2, 1], [2, 2],
      ],
      2
    ),
    defineShape(
      "l5-b",
      [
        [0, 0], [0, 1], [0, 2],
        [1, 0],
        [2, 0],
      ],
      2
    ),
    defineShape(
      "l5-c",
      [
        [0, 0], [0, 1], [0, 2],
                        [1, 2],
                        [2, 2],
      ],
      2
    ),
    defineShape(
      "l5-d",
      [
                        [0, 2],
                        [1, 2],
        [2, 0], [2, 1], [2, 2],
      ],
      2
    ),

    defineShape(
      "t4-up",
      [
        [0, 0], [0, 1], [0, 2],
                 [1, 1],
      ],
      3
    ),
    defineShape(
      "t4-down",
      [
                 [0, 1],
        [1, 0], [1, 1], [1, 2],
      ],
      3
    ),
    defineShape(
      "t4-left",
      [
        [0, 0],
        [1, 0], [1, 1],
        [2, 0],
      ],
      3
    ),
    defineShape(
      "t4-right",
      [
                 [0, 1],
        [1, 0], [1, 1],
                 [2, 1],
      ],
      3
    ),

    defineShape(
      "s4-h",
      [
                 [0, 1], [0, 2],
        [1, 0], [1, 1],
      ],
      3
    ),
    defineShape(
      "s4-v",
      [
        [0, 0],
        [1, 0], [1, 1],
                 [2, 1],
      ],
      3
    ),

    defineShape(
      "z4-h",
      [
        [0, 0], [0, 1],
                 [1, 1], [1, 2],
      ],
      3
    ),
    defineShape(
      "z4-v",
      [
                 [0, 1],
        [1, 0], [1, 1],
        [2, 0],
      ],
      3
    ),

    defineShape(
      "cross5",
      [
                 [0, 1],
        [1, 0], [1, 1], [1, 2],
                 [2, 1],
      ],
      1
    ),

    defineShape(
      "u7",
      [
        [0, 0],         [0, 2],
        [1, 0],         [1, 2],
        [2, 0], [2, 1], [2, 2],
      ],
      1
    ),
  ]);

export function getShape(
  shapeId
) {
  return (
    PIECE_CATALOG.find(
      (shape) =>
        shape.id === shapeId
    ) || null
  );
}

function assertCatalog(
  catalog
) {
  if (
    !Array.isArray(catalog) ||
    catalog.length === 0
  ) {
    throw new Error(
      "piece catalog must not be empty"
    );
  }

  const ids =
    new Set();

  for (const shape of catalog) {
    if (
      !shape ||
      typeof shape.id !== "string" ||
      !Array.isArray(shape.cells) ||
      !Number.isInteger(
        shape.cellCount
      ) ||
      shape.cellCount <= 0 ||
      !Number.isSafeInteger(
        shape.weight
      ) ||
      shape.weight <= 0 ||
      ids.has(shape.id)
    ) {
      throw new Error(
        "invalid piece catalog entry"
      );
    }

    ids.add(
      shape.id
    );
  }
}

function pickWeightedShape(
  rngState,
  catalog
) {
  assertCatalog(
    catalog
  );

  const totalWeight =
    catalog.reduce(
      (total, shape) =>
        total + shape.weight,
      0
    );

  if (
    !Number.isSafeInteger(
      totalWeight
    ) ||
    totalWeight <= 0
  ) {
    throw new Error(
      "invalid piece catalog weight"
    );
  }

  const pick =
    nextInt(
      rngState,
      totalWeight
    );

  let cursor =
    pick.value;

  for (const shape of catalog) {
    if (
      cursor <
      shape.weight
    ) {
      return {
        rngState:
          pick.state,
        shape,
      };
    }

    cursor -=
      shape.weight;
  }

  throw new Error(
    "weighted piece selection invariant failed"
  );
}

export function
generatePieceFromCatalog(
  rngState,
  serial,
  catalog
) {
  if (
    !Number.isSafeInteger(serial) ||
    serial <= 0
  ) {
    throw new RangeError(
      "piece serial must be positive"
    );
  }

  const picked =
    pickWeightedShape(
      rngState,
      catalog
    );

  return {
    rngState:
      picked.rngState,

    piece:
      Object.freeze({
        instanceId:
          `p${serial}`,

        shapeId:
          picked.shape.id,

        cells:
          picked.shape.cells,

        cellCount:
          picked.shape.cellCount,
      }),
  };
}

export function generatePiece(
  rngState,
  serial
) {
  return generatePieceFromCatalog(
    rngState,
    serial,
    PIECE_CATALOG
  );
}

export function
generateTrayFromCatalog(
  rngState,
  serialStart,
  catalog,
  size = 3
) {
  assertCatalog(
    catalog
  );

  if (
    !Number.isInteger(size) ||
    size <= 0
  ) {
    throw new RangeError(
      "tray size must be positive"
    );
  }

  let state =
    rngState;

  let serial =
    serialStart;

  const tray = [];

  for (
    let index = 0;
    index < size;
    index += 1
  ) {
    const generated =
      generatePieceFromCatalog(
        state,
        serial,
        catalog
      );

    state =
      generated.rngState;

    tray.push(
      generated.piece
    );

    serial += 1;
  }

  return {
    rngState:
      state,

    nextPieceSerial:
      serial,

    tray:
      Object.freeze(tray),
  };
}

export function generateTray(
  rngState,
  serialStart,
  size = 3
) {
  return generateTrayFromCatalog(
    rngState,
    serialStart,
    PIECE_CATALOG,
    size
  );
}
