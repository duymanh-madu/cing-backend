import { nextInt } from "./rng.js";

function freezeCells(cells) {
  return Object.freeze(
    cells.map(([row, col]) =>
      Object.freeze([row, col])
    )
  );
}

function defineShape(id, cells) {
  if (
    !id ||
    !Array.isArray(cells) ||
    cells.length === 0
  ) {
    throw new Error(
      "invalid block shape"
    );
  }

  return Object.freeze({
    id,
    cells: freezeCells(cells),
    cellCount: cells.length,
  });
}

export const PIECE_CATALOG =
  Object.freeze([
    defineShape("dot", [[0, 0]]),

    defineShape(
      "line2-h",
      [[0, 0], [0, 1]]
    ),
    defineShape(
      "line2-v",
      [[0, 0], [1, 0]]
    ),

    defineShape(
      "line3-h",
      [[0, 0], [0, 1], [0, 2]]
    ),
    defineShape(
      "line3-v",
      [[0, 0], [1, 0], [2, 0]]
    ),

    defineShape(
      "line4-h",
      [
        [0, 0], [0, 1],
        [0, 2], [0, 3],
      ]
    ),
    defineShape(
      "line4-v",
      [
        [0, 0], [1, 0],
        [2, 0], [3, 0],
      ]
    ),

    defineShape(
      "line5-h",
      [
        [0, 0], [0, 1], [0, 2],
        [0, 3], [0, 4],
      ]
    ),
    defineShape(
      "line5-v",
      [
        [0, 0], [1, 0], [2, 0],
        [3, 0], [4, 0],
      ]
    ),

    defineShape("square2", [
      [0, 0], [0, 1],
      [1, 0], [1, 1],
    ]),

    defineShape("square3", [
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1], [2, 2],
    ]),

    defineShape(
      "l3-a",
      [[0, 0], [1, 0], [1, 1]]
    ),
    defineShape(
      "l3-b",
      [[0, 0], [0, 1], [1, 0]]
    ),
    defineShape(
      "l3-c",
      [[0, 0], [0, 1], [1, 1]]
    ),
    defineShape(
      "l3-d",
      [[0, 1], [1, 0], [1, 1]]
    ),

    defineShape("l5-a", [
      [0, 0],
      [1, 0],
      [2, 0], [2, 1], [2, 2],
    ]),
    defineShape("l5-b", [
      [0, 0], [0, 1], [0, 2],
      [1, 0],
      [2, 0],
    ]),
    defineShape("l5-c", [
      [0, 0], [0, 1], [0, 2],
                      [1, 2],
                      [2, 2],
    ]),
    defineShape("l5-d", [
                      [0, 2],
                      [1, 2],
      [2, 0], [2, 1], [2, 2],
    ]),

    defineShape("t4-up", [
      [0, 0], [0, 1], [0, 2],
               [1, 1],
    ]),
    defineShape("t4-down", [
               [0, 1],
      [1, 0], [1, 1], [1, 2],
    ]),
    defineShape("t4-left", [
      [0, 0],
      [1, 0], [1, 1],
      [2, 0],
    ]),
    defineShape("t4-right", [
               [0, 1],
      [1, 0], [1, 1],
               [2, 1],
    ]),
  ]);

export function getShape(shapeId) {
  return (
    PIECE_CATALOG.find(
      (shape) =>
        shape.id === shapeId
    ) || null
  );
}

function assertCatalog(catalog) {
  if (
    !Array.isArray(catalog) ||
    catalog.length === 0
  ) {
    throw new Error(
      "piece catalog must not be empty"
    );
  }

  for (const shape of catalog) {
    if (
      !shape ||
      typeof shape.id !== "string" ||
      !Array.isArray(shape.cells) ||
      !Number.isInteger(
        shape.cellCount
      ) ||
      shape.cellCount <= 0
    ) {
      throw new Error(
        "invalid piece catalog entry"
      );
    }
  }
}

export function generatePieceFromCatalog(
  rngState,
  serial,
  catalog
) {
  assertCatalog(catalog);

  if (
    !Number.isSafeInteger(serial) ||
    serial <= 0
  ) {
    throw new RangeError(
      "piece serial must be positive"
    );
  }

  const pick =
    nextInt(
      rngState,
      catalog.length
    );

  const shape =
    catalog[pick.value];

  return {
    rngState: pick.state,

    piece: Object.freeze({
      instanceId:
        `p${serial}`,

      shapeId:
        shape.id,

      cells:
        shape.cells,

      cellCount:
        shape.cellCount,
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

export function generateTrayFromCatalog(
  rngState,
  serialStart,
  catalog,
  size = 3
) {
  assertCatalog(catalog);

  if (
    !Number.isInteger(size) ||
    size <= 0
  ) {
    throw new RangeError(
      "tray size must be positive"
    );
  }

  let state = rngState;
  let serial = serialStart;

  const tray = [];

  for (
    let i = 0;
    i < size;
    i += 1
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
    rngState: state,

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
