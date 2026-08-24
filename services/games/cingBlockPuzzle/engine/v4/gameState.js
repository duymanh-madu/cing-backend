import {
  ENGINE_VERSION,
  RULES_VERSION,
  SCORE_VERSION,
  TRAY_SIZE,
  BOARD_SIZE,
  MAX_CONTINUES,
} from "./constants.js";
import { createEmptyBoard } from "./board.js";
import { normalizeSeed } from "./rng.js";
import {
  PIECE_CATALOG,
  generateTray,
  generateTrayFromCatalog,
} from "./pieces.js";
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

    continuesUsed: 0,
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

  const perfectClear =
    cleared.lineCount > 0 &&
    cleared.board.every(
      (boardRow) =>
        boardRow.every(
          (cell) =>
            cell === 0
        )
    );

  const scoring =
    scorePlacement({
      placedCellCount: piece.cellCount,
      lineCount: cleared.lineCount,
      previousCombo: state.combo,
      previousComboGraceMoves:
        state.comboGraceMoves,
      perfectClear,
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

      perfectClear:
        scoring.perfectClear,

      perfectClearScore:
        scoring.perfectClearScore,

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

function canShapeFitBoard(
  board,
  shape
) {
  const candidate =
    Object.freeze({
      instanceId: "candidate",
      shapeId: shape.id,
      cells: shape.cells,
      cellCount:
        shape.cellCount,
    });

  for (
    let row = 0;
    row < BOARD_SIZE;
    row += 1
  ) {
    for (
      let col = 0;
      col < BOARD_SIZE;
      col += 1
    ) {
      if (
        canPlacePiece(
          board,
          candidate,
          row,
          col
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

export function applyContinue(
  state
) {
  if (!state) {
    throw new Error(
      "game state is required"
    );
  }

  if (!state.ended) {
    throw new Error(
      "continue requires game over"
    );
  }

  if (
    !Number.isInteger(
      state.continuesUsed
    ) ||
    state.continuesUsed < 0 ||
    state.continuesUsed >
      MAX_CONTINUES
  ) {
    throw new Error(
      "invalid continue state"
    );
  }

  if (
    state.continuesUsed >=
      MAX_CONTINUES
  ) {
    throw new Error(
      "continue limit reached"
    );
  }

  /*
   * The continue tray is selected only from
   * shapes that have at least one legal
   * placement on the current board.
   *
   * RNG still advances from the authoritative
   * state, so this remains deterministic while
   * guaranteeing that a purchased continue
   * actually restores playability.
   */
  const eligibleShapes =
    PIECE_CATALOG.filter(
      (shape) =>
        canShapeFitBoard(
          state.board,
          shape
        )
    );

  if (
    eligibleShapes.length === 0
  ) {
    throw new Error(
      "no playable continue shape exists"
    );
  }

  const generated =
    generateTrayFromCatalog(
      state.rngState,
      state.nextPieceSerial,
      eligibleShapes,
      TRAY_SIZE
    );

  if (
    isGameOver(
      state.board,
      generated.tray
    )
  ) {
    throw new Error(
      "continue tray invariant failed"
    );
  }

  const continueIndex =
    state.continuesUsed + 1;

  const nextState = {
    ...state,

    rngState:
      generated.rngState,

    nextPieceSerial:
      generated.nextPieceSerial,

    tray:
      generated.tray,

    continuesUsed:
      continueIndex,

    ended: false,
  };

  return {
    state:
      freezeState(nextState),

    event:
      Object.freeze({
        type: "continued",
        continueIndex,
      }),
  };
}
