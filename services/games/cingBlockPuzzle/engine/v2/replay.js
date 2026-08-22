import {
  ENGINE_VERSION,
  RULES_VERSION,
  SCORE_VERSION,
} from "./constants.js";

import {
  createGameState,
  applyMove,
} from "./gameState.js";

const REPLAY_VERSION = 2;

const REPLAY_KEYS = Object.freeze([
  "replayVersion",
  "engineVersion",
  "rulesVersion",
  "scoreVersion",
  "seed",
  "moves",
]);

const MOVE_KEYS = Object.freeze([
  "pieceInstanceId",
  "shapeId",
  "trayIndex",
  "row",
  "col",
]);

function assertExactKeys(
  value,
  expectedKeys,
  label
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(
      `${label} must be an object`
    );
  }

  const actual =
    Object.keys(value).sort();

  const expected =
    [...expectedKeys].sort();

  if (
    actual.length !== expected.length ||
    actual.some(
      (key, index) =>
        key !== expected[index]
    )
  ) {
    throw new Error(
      `${label} contains unsupported or missing fields`
    );
  }
}

function assertInteger(
  value,
  label,
  {
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER,
  } = {}
) {
  if (
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new TypeError(
      `${label} must be a safe integer`
    );
  }
}

export function createReplayTranscript(
  seed
) {
  const state =
    createGameState({ seed });

  return {
    replayVersion:
      REPLAY_VERSION,

    engineVersion:
      ENGINE_VERSION,

    rulesVersion:
      RULES_VERSION,

    scoreVersion:
      SCORE_VERSION,

    seed:
      state.seed,

    moves: [],
  };
}

export function createReplayMove(
  state,
  {
    trayIndex,
    row,
    col,
  }
) {
  if (!state || state.ended) {
    throw new Error(
      "cannot record move for ended game"
    );
  }

  assertInteger(
    trayIndex,
    "trayIndex",
    {
      min: 0,
      max:
        state.tray.length - 1,
    }
  );

  assertInteger(
    row,
    "row",
    {
      min: 0,
      max: 7,
    }
  );

  assertInteger(
    col,
    "col",
    {
      min: 0,
      max: 7,
    }
  );

  const piece =
    state.tray[trayIndex];

  if (!piece) {
    throw new Error(
      "cannot record consumed piece"
    );
  }

  return Object.freeze({
    pieceInstanceId:
      piece.instanceId,

    shapeId:
      piece.shapeId,

    trayIndex,
    row,
    col,
  });
}

export function appendReplayMove(
  transcript,
  move
) {
  validateReplayTranscript(
    transcript
  );

  validateReplayMove(move);

  return {
    ...transcript,

    moves: [
      ...transcript.moves,
      {
        ...move,
      },
    ],
  };
}

export function validateReplayMove(
  move
) {
  assertExactKeys(
    move,
    MOVE_KEYS,
    "replay move"
  );

  if (
    typeof move.pieceInstanceId !==
      "string" ||
    !/^p[1-9]\d*$/.test(
      move.pieceInstanceId
    )
  ) {
    throw new TypeError(
      "invalid pieceInstanceId"
    );
  }

  if (
    typeof move.shapeId !== "string" ||
    move.shapeId.length === 0
  ) {
    throw new TypeError(
      "invalid shapeId"
    );
  }

  assertInteger(
    move.trayIndex,
    "trayIndex",
    {
      min: 0,
      max: 2,
    }
  );

  assertInteger(
    move.row,
    "row",
    {
      min: 0,
      max: 7,
    }
  );

  assertInteger(
    move.col,
    "col",
    {
      min: 0,
      max: 7,
    }
  );

  return true;
}

export function validateReplayTranscript(
  transcript
) {
  assertExactKeys(
    transcript,
    REPLAY_KEYS,
    "replay transcript"
  );

  if (
    transcript.replayVersion !==
      REPLAY_VERSION
  ) {
    throw new Error(
      "unsupported replay version"
    );
  }

  if (
    transcript.engineVersion !==
      ENGINE_VERSION
  ) {
    throw new Error(
      "unsupported engine version"
    );
  }

  if (
    transcript.rulesVersion !==
      RULES_VERSION
  ) {
    throw new Error(
      "unsupported rules version"
    );
  }

  if (
    transcript.scoreVersion !==
      SCORE_VERSION
  ) {
    throw new Error(
      "unsupported score version"
    );
  }

  assertInteger(
    transcript.seed,
    "seed",
    {
      min: 1,
      max: 0xffffffff,
    }
  );

  if (
    !Array.isArray(
      transcript.moves
    )
  ) {
    throw new TypeError(
      "moves must be an array"
    );
  }

  for (
    const move of
    transcript.moves
  ) {
    validateReplayMove(move);
  }

  return true;
}

export function replayTranscript(
  transcript
) {
  validateReplayTranscript(
    transcript
  );

  let state =
    createGameState({
      seed:
        transcript.seed,
    });

  const events = [];

  for (
    let index = 0;
    index <
    transcript.moves.length;
    index += 1
  ) {
    const move =
      transcript.moves[index];

    if (state.ended) {
      throw new Error(
        `replay contains move after game over at index ${index}`
      );
    }

    const piece =
      state.tray[
        move.trayIndex
      ];

    if (!piece) {
      throw new Error(
        `replay references consumed piece at index ${index}`
      );
    }

    if (
      piece.instanceId !==
      move.pieceInstanceId
    ) {
      throw new Error(
        `piece instance mismatch at index ${index}`
      );
    }

    if (
      piece.shapeId !==
      move.shapeId
    ) {
      throw new Error(
        `piece shape mismatch at index ${index}`
      );
    }

    const applied =
      applyMove(
        state,
        {
          trayIndex:
            move.trayIndex,
          row:
            move.row,
          col:
            move.col,
        }
      );

    state =
      applied.state;

    events.push(
      applied.event
    );
  }

  return {
    state,

    events:
      Object.freeze(events),
  };
}

export function getReplaySummary(
  transcript
) {
  const replayed =
    replayTranscript(
      transcript
    );

  return Object.freeze({
    seed:
      transcript.seed,

    moves:
      replayed.state.moves,

    score:
      replayed.state.score,

    combo:
      replayed.state.combo,

    bestCombo:
      replayed.state.bestCombo,

    totalLinesCleared:
      replayed.state
        .totalLinesCleared,

    ended:
      replayed.state.ended,
  });
}

/*
 * Deterministic integrity fingerprint only.
 *
 * This is NOT a security signature.
 * Server-side replay remains the authority.
 */
export function replayFingerprint(
  transcript
) {
  validateReplayTranscript(
    transcript
  );

  const canonical =
    JSON.stringify({
      replayVersion:
        transcript.replayVersion,

      engineVersion:
        transcript.engineVersion,

      rulesVersion:
        transcript.rulesVersion,

      scoreVersion:
        transcript.scoreVersion,

      seed:
        transcript.seed,

      moves:
        transcript.moves.map(
          (move) => ({
            pieceInstanceId:
              move.pieceInstanceId,

            shapeId:
              move.shapeId,

            trayIndex:
              move.trayIndex,

            row:
              move.row,

            col:
              move.col,
          })
        ),
    });

  let hash = 0x811c9dc5;

  for (
    let i = 0;
    i < canonical.length;
    i += 1
  ) {
    hash ^=
      canonical.charCodeAt(i);

    hash =
      Math.imul(
        hash,
        0x01000193
      ) >>> 0;
  }

  return hash
    .toString(16)
    .padStart(8, "0");
}
