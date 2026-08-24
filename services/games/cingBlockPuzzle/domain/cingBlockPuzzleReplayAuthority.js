const crypto =
  require("crypto");

const {
  loadEngineForVersion,
} = require(
  "../engine/cingBlockPuzzleEngineLoader"
);

const MAX_REPLAY_MOVES = 10000;
const MAX_REPLAY_EVENTS = 10000;

function canonicalMove(move) {
  return {
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
  };
}

function canonicalEvent(event) {
  if (
    event?.type ===
      "continue"
  ) {
    return {
      type: "continue",

      continueIndex:
        event.continueIndex,
    };
  }

  return {
    type: "move",

    pieceInstanceId:
      event?.pieceInstanceId,

    shapeId:
      event?.shapeId,

    trayIndex:
      event?.trayIndex,

    row:
      event?.row,

    col:
      event?.col,
  };
}

function usesEventReplay(
  replayVersion
) {
  return (
    replayVersion === 3 ||
    replayVersion === 4
  );
}

function canonicalReplayJson(
  transcript
) {
  const base = {
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
  };

  if (
    usesEventReplay(
      transcript.replayVersion
    )
  ) {
    return JSON.stringify({
      ...base,

      events:
        transcript.events.map(
          canonicalEvent
        ),
    });
  }

  return JSON.stringify({
    ...base,

    moves:
      transcript.moves.map(
        canonicalMove
      ),
  });
}

function serverReplayFingerprint(
  transcript
) {
  return crypto
    .createHash("sha256")
    .update(
      canonicalReplayJson(
        transcript
      ),
      "utf8"
    )
    .digest("hex");
}

function assertReplayResourceBound(
  transcript
) {
  if (
    usesEventReplay(
      transcript.replayVersion
    )
  ) {
    if (
      !Array.isArray(
        transcript.events
      ) ||
      transcript.events.length >
        MAX_REPLAY_EVENTS
    ) {
      const error =
        new Error(
          "Replay vượt giới hạn cho phép"
        );

      error.code =
        "BLOCK_PUZZLE_REPLAY_LIMIT_EXCEEDED";

      throw error;
    }

    return;
  }

  if (
    !Array.isArray(
      transcript.moves
    ) ||
    transcript.moves.length >
      MAX_REPLAY_MOVES
  ) {
    const error =
      new Error(
        "Replay vượt giới hạn cho phép"
      );

    error.code =
      "BLOCK_PUZZLE_REPLAY_LIMIT_EXCEEDED";

    throw error;
  }
}

async function verifyReplayAuthority({
  transcript,
  expectedSeed,
  engineVersion,
  rulesVersion,
  scoreVersion,
  replayVersion,
  requireEnded = true,
}) {
  if (
    !transcript ||
    typeof transcript !==
      "object" ||
    Array.isArray(transcript)
  ) {
    const error =
      new Error(
        "Replay transcript không hợp lệ"
      );

    error.code =
      "BLOCK_PUZZLE_INVALID_REPLAY";

    throw error;
  }

  assertReplayResourceBound(
    transcript
  );

  if (
    transcript.seed !==
      expectedSeed ||
    transcript.engineVersion !==
      engineVersion ||
    transcript.rulesVersion !==
      rulesVersion ||
    transcript.scoreVersion !==
      scoreVersion ||
    transcript.replayVersion !==
      replayVersion
  ) {
    const error =
      new Error(
        "Replay không khớp session authority"
      );

    error.code =
      "BLOCK_PUZZLE_REPLAY_SESSION_MISMATCH";

    throw error;
  }

  const engine =
    await loadEngineForVersion({
      engineVersion,
      rulesVersion,
      scoreVersion,
      replayVersion,
    });

  let replayed;

  try {
    engine.validateReplayTranscript(
      transcript
    );

    replayed =
      engine.replayTranscript(
        transcript
      );
  } catch (cause) {
    if (
      String(
        cause?.code || ""
      ).startsWith(
        "BLOCK_PUZZLE_"
      )
    ) {
      throw cause;
    }

    const error =
      new Error(
        "Replay transcript không hợp lệ"
      );

    error.code =
      "BLOCK_PUZZLE_INVALID_REPLAY";

    error.cause =
      cause;

    throw error;
  }

  const state =
    replayed.state;

  if (
    requireEnded &&
    state.ended !== true
  ) {
    const error =
      new Error(
        "Replay chưa kết thúc hợp lệ"
      );

    error.code =
      "BLOCK_PUZZLE_REPLAY_NOT_FINISHED";

    throw error;
  }

  const fingerprint =
    serverReplayFingerprint(
      transcript
    );

  return Object.freeze({
    score:
      state.score,

    move_count:
      state.moves,

    best_combo:
      state.bestCombo,

    total_lines_cleared:
      state.totalLinesCleared,

    continues_used:
      Number(
        state.continuesUsed || 0
      ),

    ended:
      state.ended,

    replay_fingerprint:
      fingerprint,
  });
}

module.exports = {
  MAX_REPLAY_MOVES,
  MAX_REPLAY_EVENTS,
  canonicalReplayJson,
  serverReplayFingerprint,
  verifyReplayAuthority,
};
