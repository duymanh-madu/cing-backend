import {
  BOARD_SIZE,
  EMPTY_CELL,
  FILLED_CELL,
} from "./constants.js";

export function createEmptyBoard() {
  return Array.from(
    { length: BOARD_SIZE },
    () => Array(BOARD_SIZE).fill(EMPTY_CELL)
  );
}

export function assertBoard(board) {
  if (!Array.isArray(board) || board.length !== BOARD_SIZE) {
    throw new TypeError(`board must have ${BOARD_SIZE} rows`);
  }

  for (const row of board) {
    if (!Array.isArray(row) || row.length !== BOARD_SIZE) {
      throw new TypeError(`board rows must have ${BOARD_SIZE} cells`);
    }

    for (const cell of row) {
      if (cell !== EMPTY_CELL && cell !== FILLED_CELL) {
        throw new TypeError("board contains invalid cell");
      }
    }
  }
}

export function cloneBoard(board) {
  assertBoard(board);
  return board.map((row) => row.slice());
}

export function countFilledCells(board) {
  assertBoard(board);

  let count = 0;

  for (const row of board) {
    for (const cell of row) {
      if (cell === FILLED_CELL) count += 1;
    }
  }

  return count;
}
