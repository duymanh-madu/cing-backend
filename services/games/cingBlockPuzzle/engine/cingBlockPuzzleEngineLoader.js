const path =
  require("path");

const {
  pathToFileURL,
} =
  require("url");

let engineV1Promise = null;

function loadEngineV1() {
  if (!engineV1Promise) {
    const modulePath =
      path.join(
        __dirname,
        "v1",
        "index.js"
      );

    engineV1Promise =
      import(
        pathToFileURL(
          modulePath
        ).href
      );
  }

  return engineV1Promise;
}

async function loadEngineForVersion({
  engineVersion,
  rulesVersion,
  scoreVersion,
  replayVersion,
}) {
  if (
    engineVersion !== 1 ||
    rulesVersion !== 1 ||
    scoreVersion !== 1 ||
    replayVersion !== 1
  ) {
    const error =
      new Error(
        "Unsupported Cing Block Puzzle deterministic engine contract"
      );

    error.code =
      "BLOCK_PUZZLE_UNSUPPORTED_ENGINE_CONTRACT";

    throw error;
  }

  return loadEngineV1();
}

module.exports = {
  loadEngineV1,
  loadEngineForVersion,
};
