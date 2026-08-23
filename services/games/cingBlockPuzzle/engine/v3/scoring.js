import {
  COMBO_GRACE_MOVES,
  SCORE,
} from "./constants.js";

function assertComboState({
  previousCombo,
  previousComboGraceMoves,
}) {
  if (
    !Number.isInteger(previousCombo) ||
    previousCombo < 0 ||
    !Number.isInteger(previousComboGraceMoves) ||
    previousComboGraceMoves < 0 ||
    previousComboGraceMoves > COMBO_GRACE_MOVES
  ) {
    throw new TypeError("invalid combo state");
  }

  if (
    previousCombo === 0 &&
    previousComboGraceMoves !== 0
  ) {
    throw new TypeError(
      "inactive combo cannot retain grace moves"
    );
  }

  if (
    previousCombo > 0 &&
    previousComboGraceMoves === 0
  ) {
    throw new TypeError(
      "active combo must retain at least one grace move"
    );
  }
}

export function comboAdvanceBonus(
  combo
) {
  if (
    !Number.isSafeInteger(combo) ||
    combo <= 0
  ) {
    throw new TypeError(
      "combo must be a positive safe integer"
    );
  }

  const triangular =
    combo * (combo + 1) / 2;

  const bonus =
    SCORE.COMBO_BONUS_BASE *
    triangular;

  if (!Number.isSafeInteger(bonus)) {
    throw new RangeError(
      "combo bonus exceeds safe integer range"
    );
  }

  return bonus;
}

export function scorePlacement({
  placedCellCount,
  lineCount,
  previousCombo,
  previousComboGraceMoves,
}) {
  if (
    !Number.isInteger(placedCellCount) ||
    placedCellCount <= 0 ||
    !Number.isInteger(lineCount) ||
    lineCount < 0
  ) {
    throw new TypeError(
      "invalid scoring input"
    );
  }

  assertComboState({
    previousCombo,
    previousComboGraceMoves,
  });

  const comboAdvanced =
    lineCount > 0;

  let nextCombo =
    previousCombo;

  let nextComboGraceMoves =
    previousComboGraceMoves;

  if (comboAdvanced) {
    nextCombo =
      previousCombo + 1;

    nextComboGraceMoves =
      COMBO_GRACE_MOVES;
  } else if (
    previousCombo > 0 &&
    previousComboGraceMoves > 1
  ) {
    nextComboGraceMoves =
      previousComboGraceMoves - 1;
  } else if (
    previousCombo > 0
  ) {
    nextCombo = 0;
    nextComboGraceMoves = 0;
  }

  const placementScore =
    placedCellCount *
    SCORE.CELL_PLACED;

  const lineScore =
    lineCount > 0
      ? (
          lineCount *
            SCORE.LINE_CLEAR_BASE +
          Math.max(
            0,
            lineCount - 1
          ) *
            SCORE.MULTI_LINE_STEP *
            lineCount
        )
      : 0;

  const comboScore =
    comboAdvanced
      ? comboAdvanceBonus(
          nextCombo
        )
      : 0;

  const gainedScore =
    placementScore +
    lineScore +
    comboScore;

  if (
    !Number.isSafeInteger(
      gainedScore
    )
  ) {
    throw new RangeError(
      "score exceeds safe integer range"
    );
  }

  return Object.freeze({
    placementScore,
    lineScore,
    comboScore,
    gainedScore,
    comboAdvanced,
    nextCombo,
    nextComboGraceMoves,
  });
}
