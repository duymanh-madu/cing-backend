const crypto =
  require("crypto");

const {
  loadEngineForVersion,
} = require(
  "../engine/cingBlockPuzzleEngineLoader"
);

const MAX_REPLAY_MOVES =
  10000;

function canonicalReplayJson(
  transcript
) {
  return JSON.stringify({
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
    typeof transcript !== "object" ||
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

    ended:
      state.ended,

    replay_fingerprint:
      fingerprint,
  });
}

module.exports = {
  MAX_REPLAY_MOVES,
  canonicalReplayJson,
  serverReplayFingerprint,
  verifyReplayAuthority,
};
