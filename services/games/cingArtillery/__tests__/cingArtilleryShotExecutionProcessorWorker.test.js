"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");


const workerPath =
  path.join(
    process.cwd(),
    "services/games/cingArtillery/workers/cingArtilleryShotExecutionProcessorWorker.js"
  );

const recoveryPath =
  path.join(
    process.cwd(),
    "services/games/cingArtillery/workers/cingArtilleryShotExecutionWorker.js"
  );


test(
  "processor worker owns claim-process-release lifecycle",
  () => {
    const source =
      fs.readFileSync(
        workerPath,
        "utf8"
      );

    assert.match(
      source,
      /\bclaimShotExecutions\b/u
    );

    assert.match(
      source,
      /\bprocessClaimedShotExecutionV1\b/u
    );

    assert.match(
      source,
      /\breleaseShotExecution\b/u
    );

    assert.match(
      source,
      /execution\?\.claim_token/u
    );
  }
);


test(
  "processor worker releases failures using same claim token",
  () => {
    const source =
      fs.readFileSync(
        workerPath,
        "utf8"
      );

    assert.match(
      source,
      /releaseShotExecution\(\{\s*executionId,\s*claimToken,/su
    );

    assert.match(
      source,
      /lastError:/u
    );
  }
);


test(
  "processor worker does not own expired lease recovery",
  () => {
    const source =
      fs.readFileSync(
        workerPath,
        "utf8"
      );

    assert.doesNotMatch(
      source,
      /releaseExpiredShotExecutions/u
    );
  }
);


test(
  "existing recovery worker remains recovery only",
  () => {
    const source =
      fs.readFileSync(
        recoveryPath,
        "utf8"
      );

    assert.match(
      source,
      /releaseExpiredShotExecutions/u
    );

    assert.doesNotMatch(
      source,
      /processClaimedShotExecutionV1/u
    );

    assert.doesNotMatch(
      source,
      /claimShotExecutions/u
    );
  }
);


test(
  "processor worker prevents overlapping local loops",
  () => {
    const source =
      fs.readFileSync(
        workerPath,
        "utf8"
      );

    assert.match(
      source,
      /if \(running\)/u
    );

    assert.match(
      source,
      /reason:\s*"already_running"/u
    );

    assert.match(
      source,
      /finally \{\s*running =\s*false;/su
    );
  }
);


test(
  "processor worker has explicit start and stop lifecycle",
  () => {
    const source =
      fs.readFileSync(
        workerPath,
        "utf8"
      );

    assert.match(
      source,
      /function startCingArtilleryShotExecutionProcessorWorker/u
    );

    assert.match(
      source,
      /function stopCingArtilleryShotExecutionProcessorWorker/u
    );

    assert.match(
      source,
      /clearInterval/u
    );
  }
);
