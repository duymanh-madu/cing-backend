import { hasAnyPlacement } from "./placement.js";

export function hasLegalMove(board, tray) {
  if (!Array.isArray(tray)) {
    throw new TypeError("tray must be an array");
  }

  for (const piece of tray) {
    if (piece && hasAnyPlacement(board, piece)) {
      return true;
    }
  }

  return false;
}

export function isGameOver(board, tray) {
  const remaining = tray.filter(Boolean);

  if (remaining.length === 0) {
    return false;
  }

  return !hasLegalMove(board, remaining);
}
