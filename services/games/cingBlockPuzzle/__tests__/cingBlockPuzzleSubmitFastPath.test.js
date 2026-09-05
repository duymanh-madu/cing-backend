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

const serverSource =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "server.js"
    ),
    "utf8"
  );

const migrationSource =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20260905_cing_block_puzzle_submit_top1_outbox_v1.sql"
    ),
    "utf8"
  );

test(
  "gameplay submit no longer awaits global Top1 scan",
  () => {
    assert.doesNotMatch(
      submitSource,
      /await\s+checkAndNotifyTop1Changes/
    );

    assert.match(
      submitSource,
      /wakeCingBlockPuzzleSubmitTop1Worker/
    );
  }
);

test(
  "Top1 wake occurs only after authoritative response assertions",
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

    const returned =
      submitSource.indexOf(
        "return persisted;",
        wake
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

    assert.ok(
      returned > wake
    );
  }
);

test(
  "submit transaction durably creates one Top1 effect per session",
  () => {
    assert.match(
      migrationSource,
      /cing_block_puzzle_submit_effects/
    );

    assert.match(
      migrationSource,
      /session_id uuid primary key/
    );

    assert.match(
      migrationSource,
      /on conflict[\s\S]*session_id[\s\S]*do nothing/i
    );

    assert.match(
      migrationSource,
      /pg_get_functiondef/
    );

    assert.match(
      migrationSource,
      /regexp_replace/
    );
  }
);

test(
  "durable worker has lock stale recovery retry and scheduler health",
  () => {
    assert.match(
      workerSource,
      /releaseStuckEffects/
    );

    assert.match(
      workerSource,
      /"NX"/
    );

    assert.match(
      workerSource,
      /nextRetryIso/
    );

    assert.match(
      workerSource,
      /MAX_RETRIES/
    );

    assert.match(
      workerSource,
      /registerScheduler/
    );

    assert.match(
      workerSource,
      /markSchedulerSuccess/
    );

    assert.match(
      workerSource,
      /markSchedulerError/
    );
  }
);

test(
  "worker reuses canonical Top1 notification authority",
  () => {
    assert.match(
      workerSource,
      /checkAndNotifyTop1Changes/
    );
  }
);

test(
  "worker bootstrap has independent failure domain",
  () => {
    assert.match(
      serverSource,
      /CING BLOCK PUZZLE SUBMIT TOP1 WORKER[\s\S]*startCingBlockPuzzleSubmitTop1Worker[\s\S]*BLOCK PUZZLE SUBMIT TOP1/
    );
  }
);

test(
  "submit effect table remains backend only",
  () => {
    assert.match(
      migrationSource,
      /revoke all[\s\S]*cing_block_puzzle_submit_effects[\s\S]*from public, anon, authenticated/i
    );

    assert.match(
      migrationSource,
      /grant[\s\S]*select[\s\S]*insert[\s\S]*update[\s\S]*delete[\s\S]*to service_role/i
    );
  }
);

test(
  "durable worker requires canonical Top1 failures to propagate",
  () => {
    assert.match(
      workerSource,
      /checkAndNotifyTop1Changes\([\s\S]*throwOnError:\s*true/
    );
  }
);
