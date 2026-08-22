import { SCORE } from "./constants.js";

export function scorePlacement({
  placedCellCount,
  lineCount,
  previousCombo,
}) {
  if (
    !Number.isInteger(placedCellCount) ||
    placedCellCount <= 0 ||
    !Number.isInteger(lineCount) ||
    lineCount < 0 ||
    !Number.isInteger(previousCombo) ||
    previousCombo < 0
  ) {
    throw new TypeError("invalid scoring input");
  }

  const nextCombo = lineCount > 0
    ? previousCombo + 1
    : 0;

  const placementScore =
    placedCellCount * SCORE.CELL_PLACED;

  const lineScore =
    lineCount > 0
      ? (
          lineCount * SCORE.LINE_CLEAR_BASE +
          Math.max(0, lineCount - 1) *
            SCORE.MULTI_LINE_STEP *
            lineCount
        )
      : 0;

  const comboScore =
    lineCount > 0 && nextCombo > 1
      ? (nextCombo - 1) * SCORE.COMBO_STEP
      : 0;

  return Object.freeze({
    placementScore,
    lineScore,
    comboScore,
    gainedScore:
      placementScore +
      lineScore +
      comboScore,
    nextCombo,
  });
}
