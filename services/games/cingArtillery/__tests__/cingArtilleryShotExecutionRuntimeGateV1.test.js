"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");


const featureGatePath =
  path.join(
    process.cwd(),
    "services/games/cingArtillery/services/cingArtilleryFeatureGateService.js"
  );

const processorWorkerPath =
  path.join(
    process.cwd(),
    "services/games/cingArtillery/workers/cingArtilleryShotExecutionProcessorWorker.js"
  );

const recoveryWorkerPath =
  path.join(
    process.cwd(),
    "services/games/cingArtillery/workers/cingArtilleryShotExecutionWorker.js"
  );

const serverPath =
  path.join(
    process.cwd(),
    "server.js"
  );


test(
  "runtime config exposes canonical execution worker V1 gate",
  () => {
    const source =
      fs.readFileSync(
        featureGatePath,
        "utf8"
      );

    assert.match(
      source,
      /source\.execution_worker/u
    );

    assert.match(
      source,
      /executionWorkerVersion === 1/u
    );

    assert.match(
      source,
      /executionWorker\.enabled === true/u
    );

    assert.match(
      source,
      /async function isCingArtilleryExecutionWorkerEnabled/u
    );
  }
);


test(
  "execution worker gate fails closed for unsupported version",
  () => {
    const source =
      fs.readFileSync(
        featureGatePath,
        "utf8"
      );

    assert.match(
      source,
      /executionWorkerVersion === 1\s*&&\s*executionWorker\.enabled === true/su
    );
  }
);


test(
  "processor checks canonical DB-backed gate before claim",
  () => {
    const source =
      fs.readFileSync(
        processorWorkerPath,
        "utf8"
      );

    const gateIndex =
      source.indexOf(
        "await isCingArtilleryExecutionWorkerEnabled()"
      );

    const claimIndex =
      source.indexOf(
        "await claimShotExecutions("
      );

    assert.ok(
      gateIndex >= 0,
      "missing execution worker gate"
    );

    assert.ok(
      claimIndex >= 0,
      "missing shot execution claim"
    );

    assert.ok(
      gateIndex < claimIndex,
      "gate must be evaluated before claim"
    );

    assert.match(
      source,
      /reason:\s*"execution_worker_disabled"/u
    );
  }
);


test(
  "processor runtime gate does not depend on process env",
  () => {
    const source =
      fs.readFileSync(
        featureGatePath,
        "utf8"
      );

    assert.doesNotMatch(
      source,
      /process\.env/u
    );
  }
);


test(
  "recovery worker remains independent of execution worker gate",
  () => {
    const source =
      fs.readFileSync(
        recoveryWorkerPath,
        "utf8"
      );

    assert.doesNotMatch(
      source,
      /isCingArtilleryExecutionWorkerEnabled/u
    );

    assert.match(
      source,
      /releaseExpiredShotExecutions/u
    );
  }
);


test(
  "server starts processor infrastructure",
  () => {
    const source =
      fs.readFileSync(
        serverPath,
        "utf8"
      );

    assert.match(
      source,
      /startCingArtilleryShotExecutionProcessorWorker/u
    );
  }
);


test(
  "graceful shutdown stops processor claims",
  () => {
    const source =
      fs.readFileSync(
        serverPath,
        "utf8"
      );

    const stopIndex =
      source.indexOf(
        "stopCingArtilleryShotExecutionProcessorWorker"
      );

    const socketCloseIndex =
      source.indexOf(
        "ioInstance.close()"
      );

    assert.ok(
      stopIndex >= 0,
      "missing processor stop lifecycle"
    );

    assert.ok(
      socketCloseIndex >= 0,
      "missing socket shutdown"
    );

    assert.ok(
      stopIndex < socketCloseIndex,
      "processor must stop before socket/http shutdown"
    );
  }
);
