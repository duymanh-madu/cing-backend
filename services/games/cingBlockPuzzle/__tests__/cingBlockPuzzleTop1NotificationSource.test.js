const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const submitSource =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "services/games/cingBlockPuzzle/cingBlockPuzzleSubmitService.js"
    ),
    "utf8"
  );

const workerSource =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "services/games/cingBlockPuzzle/workers/cingBlockPuzzleSubmitTop1Worker.js"
    ),
    "utf8"
  );

test(
  "Top1 delivery is post-authority and off gameplay critical path",
  () => {
    const rpc =
      submitSource.indexOf(
        "await submitSessionAtomic"
      );

    const mismatch =
      submitSource.indexOf(
        "BLOCK_PUZZLE_SUBMIT_AUTHORITY_MISMATCH"
      );

    const wake =
      submitSource.indexOf(
        "wakeCingBlockPuzzleSubmitTop1Worker"
      );

    assert.ok(
      rpc >= 0
    );

    assert.ok(
      mismatch > rpc
    );

    assert.ok(
      wake > mismatch
    );

    assert.doesNotMatch(
      submitSource,
      /await\s+checkAndNotifyTop1Changes/
    );
  }
);

test(
  "Block Puzzle worker reuses canonical shared Top1 notification service",
  () => {
    assert.match(
      workerSource,
      /require\(\s*["']\.\.\/\.\.\/\.\.\/leaderboardResetService["']\s*\)/
    );

    assert.match(
      workerSource,
      /await checkAndNotifyTop1Changes/
    );
  }
);

test(
  "idempotent submit can safely wake the same durable effect",
  () => {
    assert.match(
      submitSource,
      /wakeCingBlockPuzzleSubmitTop1Worker/
    );
  }
);

test(
  "Top1 side effect cannot invalidate committed gameplay submit",
  () => {
    const wake =
      submitSource.indexOf(
        "wakeCingBlockPuzzleSubmitTop1Worker"
      );

    const returned =
      submitSource.indexOf(
        "return persisted;",
        wake
      );

    assert.ok(
      wake >= 0
    );

    assert.ok(
      returned > wake
    );

    assert.match(
      submitSource.slice(
        Math.max(
          0,
          wake - 300
        ),
        returned
      ),
      /try[\s\S]*catch/
    );
  }
);
