import {
  ENGINE_VERSION,
  RULES_VERSION,
  SCORE_VERSION,
  TRAY_SIZE,
} from "./constants.js";
import { createEmptyBoard } from "./board.js";
import { normalizeSeed } from "./rng.js";
import { generateTray } from "./pieces.js";
import {
  canPlacePiece,
  placePieceOnBoard,
} from "./placement.js";
import { clearCompletedLines } from "./lineClear.js";
import { scorePlacement } from "./scoring.js";
import { isGameOver } from "./gameOver.js";

function freezeState(state) {
  Object.freeze(state.tray);
  return Object.freeze(state);
}

export function createGameState({ seed }) {
  const normalizedSeed = normalizeSeed(seed);

  const generated = generateTray(
    normalizedSeed,
    1,
    TRAY_SIZE
  );

  const state = {
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    scoreVersion: SCORE_VERSION,

    seed: normalizedSeed,
    rngState: generated.rngState,
    nextPieceSerial: generated.nextPieceSerial,

    board: createEmptyBoard(),
    tray: generated.tray,

    score: 0,
    combo: 0,
    comboGraceMoves: 0,
    bestCombo: 0,
    moves: 0,
    totalLinesCleared: 0,

    ended: false,
  };

  return freezeState(state);
}

export function applyMove(
  state,
  {
    trayIndex,
    row,
    col,
  }
) {
  if (!state || state.ended) {
    throw new Error("game is not playable");
  }

  if (
    !Number.isInteger(trayIndex) ||
    trayIndex < 0 ||
    trayIndex >= state.tray.length
  ) {
    throw new RangeError("invalid tray index");
  }

  const piece = state.tray[trayIndex];

  if (!piece) {
    throw new Error("piece already consumed");
  }

  if (!canPlacePiece(state.board, piece, row, col)) {
    throw new Error("illegal placement");
  }

  const placedBoard =
    placePieceOnBoard(
      state.board,
      piece,
      row,
      col
    );

  const cleared =
    clearCompletedLines(placedBoard);

  const scoring =
    scorePlacement({
      placedCellCount: piece.cellCount,
      lineCount: cleared.lineCount,
      previousCombo: state.combo,
      previousComboGraceMoves:
        state.comboGraceMoves,
    });

  let rngState = state.rngState;
  let nextPieceSerial = state.nextPieceSerial;

  let tray = state.tray.map(
    (entry, index) =>
      index === trayIndex
        ? null
        : entry
  );

  if (tray.every((entry) => entry === null)) {
    const generated =
      generateTray(
        rngState,
        nextPieceSerial,
        TRAY_SIZE
      );

    rngState = generated.rngState;
    nextPieceSerial =
      generated.nextPieceSerial;
    tray = generated.tray;
  } else {
    tray = Object.freeze(tray);
  }

  const ended =
    isGameOver(
      cleared.board,
      tray
    );

  const nextState = {
    ...state,

    rngState,
    nextPieceSerial,

    board: cleared.board,
    tray,

    score:
      state.score +
      scoring.gainedScore,

    combo:
      scoring.nextCombo,

    comboGraceMoves:
      scoring.nextComboGraceMoves,

    bestCombo:
      Math.max(
        state.bestCombo,
        scoring.nextCombo
      ),

    moves:
      state.moves + 1,

    totalLinesCleared:
      state.totalLinesCleared +
      cleared.lineCount,

    ended,
  };

  return {
    state: freezeState(nextState),

    event: Object.freeze({
      type: "piece_placed",
      pieceInstanceId:
        piece.instanceId,
      shapeId:
        piece.shapeId,
      trayIndex,
      row,
      col,

      clearedRows:
        Object.freeze(
          cleared.rows.slice()
        ),

      clearedCols:
        Object.freeze(
          cleared.cols.slice()
        ),

      lineCount:
        cleared.lineCount,

      clearedCellCount:
        cleared.clearedCellCount,

      gainedScore:
        scoring.gainedScore,

      placementScore:
        scoring.placementScore,

      lineScore:
        scoring.lineScore,

      comboScore:
        scoring.comboScore,

      comboAdvanced:
        scoring.comboAdvanced,

      combo:
        scoring.nextCombo,

      comboGraceMoves:
        scoring.nextComboGraceMoves,

      score:
        nextState.score,

      ended,
    }),
  };
}
