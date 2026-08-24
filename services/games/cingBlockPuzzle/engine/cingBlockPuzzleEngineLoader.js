const path =
  require("path");

const {
  pathToFileURL,
} =
  require("url");

const CONTRACT_V1 =
  Object.freeze({
    engineVersion: 1,
    rulesVersion: 1,
    scoreVersion: 1,
    replayVersion: 1,
  });

const CONTRACT_V2 =
  Object.freeze({
    engineVersion: 2,
    rulesVersion: 2,
    scoreVersion: 2,
    replayVersion: 2,
  });

const CONTRACT_V3 =
  Object.freeze({
    engineVersion: 2,
    rulesVersion: 2,
    scoreVersion: 2,
    replayVersion: 3,
  });

const CONTRACT_V4 =
  Object.freeze({
    engineVersion: 3,
    rulesVersion: 3,
    scoreVersion: 3,
    replayVersion: 4,
  });

let engineV1Promise = null;
let engineV2Promise = null;
let engineV3Promise = null;
let engineV4Promise = null;

function loadEngineModule(
  version
) {
  const modulePath =
    path.join(
      __dirname,
      `v${version}`,
      "index.js"
    );

  return import(
    pathToFileURL(
      modulePath
    ).href
  );
}

function loadEngineV1() {
  if (!engineV1Promise) {
    engineV1Promise =
      loadEngineModule(1);
  }

  return engineV1Promise;
}

function loadEngineV2() {
  if (!engineV2Promise) {
    engineV2Promise =
      loadEngineModule(2);
  }

  return engineV2Promise;
}

function loadEngineV3() {
  if (!engineV3Promise) {
    engineV3Promise =
      loadEngineModule(3);
  }

  return engineV3Promise;
}

function loadEngineV4() {
  if (!engineV4Promise) {
    engineV4Promise =
      loadEngineModule(4);
  }

  return engineV4Promise;
}

function matchesContract(
  contract,
  supported
) {
  return (
    contract.engineVersion ===
      supported.engineVersion &&
    contract.rulesVersion ===
      supported.rulesVersion &&
    contract.scoreVersion ===
      supported.scoreVersion &&
    contract.replayVersion ===
      supported.replayVersion
  );
}

function isSupportedEngineContract({
  engineVersion,
  rulesVersion,
  scoreVersion,
  replayVersion,
}) {
  const contract = {
    engineVersion:
      Number(engineVersion),

    rulesVersion:
      Number(rulesVersion),

    scoreVersion:
      Number(scoreVersion),

    replayVersion:
      Number(replayVersion),
  };

  return (
    matchesContract(
      contract,
      CONTRACT_V1
    ) ||
    matchesContract(
      contract,
      CONTRACT_V2
    ) ||
    matchesContract(
      contract,
      CONTRACT_V3
    ) ||
    matchesContract(
      contract,
      CONTRACT_V4
    )
  );
}

async function
loadEngineForVersion({
  engineVersion,
  rulesVersion,
  scoreVersion,
  replayVersion,
}) {
  const contract = {
    engineVersion:
      Number(engineVersion),

    rulesVersion:
      Number(rulesVersion),

    scoreVersion:
      Number(scoreVersion),

    replayVersion:
      Number(replayVersion),
  };

  if (
    matchesContract(
      contract,
      CONTRACT_V1
    )
  ) {
    return loadEngineV1();
  }

  if (
    matchesContract(
      contract,
      CONTRACT_V2
    )
  ) {
    return loadEngineV2();
  }

  if (
    matchesContract(
      contract,
      CONTRACT_V3
    )
  ) {
    return loadEngineV3();
  }

  if (
    matchesContract(
      contract,
      CONTRACT_V4
    )
  ) {
    return loadEngineV4();
  }

  const error =
    new Error(
      "Unsupported Cing Block Puzzle deterministic engine contract"
    );

  error.code =
    "BLOCK_PUZZLE_UNSUPPORTED_ENGINE_CONTRACT";

  throw error;
}

module.exports = {
  CONTRACT_V1,
  CONTRACT_V2,
  CONTRACT_V3,
  CONTRACT_V4,
  loadEngineV1,
  loadEngineV2,
  loadEngineV3,
  loadEngineV4,
  isSupportedEngineContract,
  loadEngineForVersion,
};
