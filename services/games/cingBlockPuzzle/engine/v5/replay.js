import {
  ENGINE_VERSION,
  RULES_VERSION,
  SCORE_VERSION,
  REPLAY_VERSION,
  MAX_CONTINUES,
} from "./constants.js";

import {
  createGameState,
  applyMove,
  applyContinue,
} from "./gameState.js";

const MAX_REPLAY_EVENTS =
  10000;

const REPLAY_KEYS =
  Object.freeze([
    "replayVersion",
    "engineVersion",
    "rulesVersion",
    "scoreVersion",
    "seed",
    "events",
  ]);

const MOVE_EVENT_KEYS =
  Object.freeze([
    "type",
    "pieceInstanceId",
    "shapeId",
    "trayIndex",
    "row",
    "col",
  ]);

const CONTINUE_EVENT_KEYS =
  Object.freeze([
    "type",
    "continueIndex",
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
    Object.keys(value)
      .sort();

  const expected =
    [...expectedKeys]
      .sort();

  if (
    actual.length !==
      expected.length ||
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
    min =
      Number.MIN_SAFE_INTEGER,

    max =
      Number.MAX_SAFE_INTEGER,
  } = {}
) {
  if (
    !Number.isSafeInteger(
      value
    ) ||
    value < min ||
    value > max
  ) {
    throw new TypeError(
      `${label} must be a safe integer`
    );
  }
}

export function
createReplayTranscript(seed) {
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

    events: [],
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
  if (
    !state ||
    state.ended
  ) {
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
    state.tray[
      trayIndex
    ];

  if (!piece) {
    throw new Error(
      "cannot record consumed piece"
    );
  }

  return Object.freeze({
    type: "move",

    pieceInstanceId:
      piece.instanceId,

    shapeId:
      piece.shapeId,

    trayIndex,
    row,
    col,
  });
}

export function
createReplayContinue(state) {
  if (!state) {
    throw new Error(
      "game state is required"
    );
  }

  if (!state.ended) {
    throw new Error(
      "cannot continue before game over"
    );
  }

  const continueIndex =
    Number(
      state.continuesUsed
    ) + 1;

  assertInteger(
    continueIndex,
    "continueIndex",
    {
      min: 1,
      max: MAX_CONTINUES,
    }
  );

  return Object.freeze({
    type: "continue",
    continueIndex,
  });
}

export function
validateReplayMove(event) {
  assertExactKeys(
    event,
    MOVE_EVENT_KEYS,
    "replay move"
  );

  if (
    event.type !== "move"
  ) {
    throw new TypeError(
      "invalid move event type"
    );
  }

  if (
    typeof
      event.pieceInstanceId !==
        "string" ||
    !/^p[1-9]\d*$/.test(
      event.pieceInstanceId
    )
  ) {
    throw new TypeError(
      "invalid pieceInstanceId"
    );
  }

  if (
    typeof event.shapeId !==
      "string" ||
    event.shapeId.length === 0
  ) {
    throw new TypeError(
      "invalid shapeId"
    );
  }

  assertInteger(
    event.trayIndex,
    "trayIndex",
    {
      min: 0,
      max: 2,
    }
  );

  assertInteger(
    event.row,
    "row",
    {
      min: 0,
      max: 7,
    }
  );

  assertInteger(
    event.col,
    "col",
    {
      min: 0,
      max: 7,
    }
  );

  return true;
}

export function
validateReplayContinue(event) {
  assertExactKeys(
    event,
    CONTINUE_EVENT_KEYS,
    "replay continue"
  );

  if (
    event.type !==
      "continue"
  ) {
    throw new TypeError(
      "invalid continue event type"
    );
  }

  assertInteger(
    event.continueIndex,
    "continueIndex",
    {
      min: 1,
      max: MAX_CONTINUES,
    }
  );

  return true;
}

export function
validateReplayEvent(event) {
  if (
    !event ||
    typeof event !== "object" ||
    Array.isArray(event)
  ) {
    throw new TypeError(
      "replay event must be an object"
    );
  }

  if (
    event.type === "move"
  ) {
    return validateReplayMove(
      event
    );
  }

  if (
    event.type ===
      "continue"
  ) {
    return validateReplayContinue(
      event
    );
  }

  throw new Error(
    "unsupported replay event"
  );
}

export function
validateReplayTranscript(
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
      transcript.events
    )
  ) {
    throw new TypeError(
      "events must be an array"
    );
  }

  if (
    transcript.events.length >
      MAX_REPLAY_EVENTS
  ) {
    throw new Error(
      "replay event limit exceeded"
    );
  }

  for (
    const event of
    transcript.events
  ) {
    validateReplayEvent(
      event
    );
  }

  return true;
}

export function
appendReplayEvent(
  transcript,
  event
) {
  validateReplayTranscript(
    transcript
  );

  validateReplayEvent(
    event
  );

  if (
    transcript.events.length >=
      MAX_REPLAY_EVENTS
  ) {
    throw new Error(
      "replay event limit exceeded"
    );
  }

  return {
    ...transcript,

    events: [
      ...transcript.events,
      {
        ...event,
      },
    ],
  };
}

export function
appendReplayMove(
  transcript,
  move
) {
  validateReplayMove(
    move
  );

  return appendReplayEvent(
    transcript,
    move
  );
}

export function
appendReplayContinue(
  transcript,
  event
) {
  validateReplayContinue(
    event
  );

  return appendReplayEvent(
    transcript,
    event
  );
}

export function
replayTranscript(
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
      transcript.events.length;
    index += 1
  ) {
    const replayEvent =
      transcript.events[
        index
      ];

    if (
      replayEvent.type ===
        "continue"
    ) {
      if (!state.ended) {
        throw new Error(
          `replay contains continue before game over at index ${index}`
        );
      }

      const expectedIndex =
        state.continuesUsed + 1;

      if (
        replayEvent
          .continueIndex !==
        expectedIndex
      ) {
        throw new Error(
          `continue index mismatch at index ${index}`
        );
      }

      const applied =
        applyContinue(
          state
        );

      state =
        applied.state;

      events.push(
        applied.event
      );

      continue;
    }

    if (state.ended) {
      throw new Error(
        `replay contains move after game over at index ${index}`
      );
    }

    const piece =
      state.tray[
        replayEvent
          .trayIndex
      ];

    if (!piece) {
      throw new Error(
        `replay references consumed piece at index ${index}`
      );
    }

    if (
      piece.instanceId !==
        replayEvent
          .pieceInstanceId
    ) {
      throw new Error(
        `piece instance mismatch at index ${index}`
      );
    }

    if (
      piece.shapeId !==
        replayEvent.shapeId
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
            replayEvent
              .trayIndex,

          row:
            replayEvent.row,

          col:
            replayEvent.col,
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

export function
getReplaySummary(
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

    continues:
      replayed.state
        .continuesUsed,

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
export function
replayFingerprint(
  transcript
) {
  validateReplayTranscript(
    transcript
  );

  const canonical =
    JSON.stringify({
      replayVersion:
        transcript
          .replayVersion,

      engineVersion:
        transcript
          .engineVersion,

      rulesVersion:
        transcript
          .rulesVersion,

      scoreVersion:
        transcript
          .scoreVersion,

      seed:
        transcript.seed,

      events:
        transcript.events.map(
          (event) => {
            if (
              event.type ===
                "continue"
            ) {
              return {
                type:
                  "continue",

                continueIndex:
                  event
                    .continueIndex,
              };
            }

            return {
              type:
                "move",

              pieceInstanceId:
                event
                  .pieceInstanceId,

              shapeId:
                event.shapeId,

              trayIndex:
                event.trayIndex,

              row:
                event.row,

              col:
                event.col,
            };
          }
        ),
    });

  let hash =
    0x811c9dc5;

  for (
    let i = 0;
    i < canonical.length;
    i += 1
  ) {
    hash ^=
      canonical
        .charCodeAt(i);

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
