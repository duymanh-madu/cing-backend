export const GAME_KEY = "cing-block-puzzle";

export const ENGINE_VERSION = 3;
export const RULES_VERSION = 3;
export const SCORE_VERSION = 3;
export const REPLAY_VERSION = 4;

export const BOARD_SIZE = 8;
export const TRAY_SIZE = 3;

export const COMBO_GRACE_MOVES = 3;
export const MAX_CONTINUES = 3;

export const SCORE = Object.freeze({
  CELL_PLACED: 1,
  LINE_CLEAR_BASE: 15,
  MULTI_LINE_STEP: 5,
  COMBO_BONUS_BASE: 5,

  PERFECT_CLEAR_BASE: 300,
  PERFECT_CLEAR_COMBO_STEP: 100,
});

export const EMPTY_CELL = 0;
export const FILLED_CELL = 1;
