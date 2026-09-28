import {
  BOARD_SIZE,
  EMPTY_CELL,
  FILLED_CELL,
} from "./constants.js";
import { assertBoard, cloneBoard } from "./board.js";

export function findCompletedLines(board) {
  assertBoard(board);

  const rows = [];
  const cols = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    if (board[row].every((cell) => cell === FILLED_CELL)) {
      rows.push(row);
    }
  }

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let complete = true;

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      if (board[row][col] !== FILLED_CELL) {
        complete = false;
        break;
      }
    }

    if (complete) cols.push(col);
  }

  return { rows, cols };
}

export function clearCompletedLines(board) {
  const { rows, cols } = findCompletedLines(board);

  if (rows.length === 0 && cols.length === 0) {
    return {
      board: cloneBoard(board),
      rows,
      cols,
      lineCount: 0,
      clearedCellCount: 0,
    };
  }

  const next = cloneBoard(board);
  const cleared = new Set();

  for (const row of rows) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      cleared.add(`${row}:${col}`);
      next[row][col] = EMPTY_CELL;
    }
  }

  for (const col of cols) {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      cleared.add(`${row}:${col}`);
      next[row][col] = EMPTY_CELL;
    }
  }

  return {
    board: next,
    rows,
    cols,
    lineCount: rows.length + cols.length,
    clearedCellCount: cleared.size,
  };
}
