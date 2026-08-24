import {
  BOARD_SIZE,
  EMPTY_CELL,
  FILLED_CELL,
} from "./constants.js";
import { assertBoard, cloneBoard } from "./board.js";

function assertPiece(piece) {
  if (!piece || !Array.isArray(piece.cells) || piece.cells.length === 0) {
    throw new TypeError("invalid piece");
  }
}

export function canPlacePiece(board, piece, originRow, originCol) {
  assertBoard(board);
  assertPiece(piece);

  if (!Number.isInteger(originRow) || !Number.isInteger(originCol)) {
    return false;
  }

  for (const [dr, dc] of piece.cells) {
    const row = originRow + dr;
    const col = originCol + dc;

    if (
      row < 0 ||
      col < 0 ||
      row >= BOARD_SIZE ||
      col >= BOARD_SIZE
    ) {
      return false;
    }

    if (board[row][col] !== EMPTY_CELL) {
      return false;
    }
  }

  return true;
}

export function placePieceOnBoard(board, piece, originRow, originCol) {
  if (!canPlacePiece(board, piece, originRow, originCol)) {
    throw new Error("illegal placement");
  }

  const next = cloneBoard(board);

  for (const [dr, dc] of piece.cells) {
    next[originRow + dr][originCol + dc] = FILLED_CELL;
  }

  return next;
}

export function hasAnyPlacement(board, piece) {
  assertBoard(board);
  assertPiece(piece);

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (canPlacePiece(board, piece, row, col)) {
        return true;
      }
    }
  }

  return false;
}
