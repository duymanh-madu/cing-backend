const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

function read(path) {
  return fs.readFileSync(
    path,
    "utf8"
  );
}

const migration =
  read(
    "db/migrations/20260823_cing_block_puzzle_continue_ipos_delivery_v1.sql"
  );

const worker =
  read(
    "services/games/cingBlockPuzzle/workers/cingBlockPuzzleContinueIposSyncWorker.js"
  );

const service =
  read(
    "services/games/cingBlockPuzzle/cingBlockPuzzleContinueService.js"
  );

const membership =
  read(
    "routes/membershipRoutes.js"
  );

const webhook =
  read(
    "routes/iposWebhookRoutes.js"
  );

test(
  "continue balance check remains serialized under player row lock",
  () => {
    assert.match(
      migration,
      /from public\.players[\s\S]*for update[\s\S]*BLOCK_PUZZLE_INSUFFICIENT_POINTS/
    );

    assert.match(
      migration,
      /required_points[\s\S]*current_points/
    );
  }
);

test(
  "legacy purchases are not automatically redelivered",
  () => {
    assert.match(
      migration,
      /legacy_synced/
    );

    assert.match(
      migration,
      /set default 'pending'/
    );
  }
);

test(
  "new Continue purchases have durable iPOS delivery lifecycle",
  () => {
    for (
      const status of [
        "pending",
        "processing",
        "synced",
        "failed",
      ]
    ) {
      assert.match(
        migration,
        new RegExp(status)
      );
    }

    assert.match(
      worker,
      /type_change:[\s\S]*"MINUS"/
    );

    assert.match(
      worker,
      /CING-BP-CONTINUE-\$\{purchaseId\}/
    );
  }
);

test(
  "iPOS delivery preflight and postflight prevent duplicate MINUS",
  () => {
    const matches =
      worker.match(
        /findMembershipLogByNote/g
      ) || [];

    assert.ok(
      matches.length >= 2
    );

    assert.match(
      worker,
      /preflight\.found/
    );

    assert.match(
      worker,
      /postflight\.found/
    );
  }
);

test(
  "external CRM snapshots serialize with Continue point balance",
  () => {
    assert.match(
      migration,
      /cing_loyalty_apply_external_point_snapshot_guarded/
    );

    assert.match(
      migration,
      /ipos_sync_status in \([\s\S]*'pending'[\s\S]*'processing'[\s\S]*'failed'/
    );

    assert.match(
      membership,
      /applyExternalPointSnapshotGuarded/
    );

    assert.match(
      webhook,
      /applyExternalPointSnapshotGuarded/
    );

    assert.doesNotMatch(
      webhook,
      /\.update\(\{\s*total_points:\s*crmPoints\s*\}\)/
    );
  }
);

test(
  "successful purchase publishes authoritative balance after commit",
  () => {
    assert.match(
      service,
      /publishContinuePurchaseCommitted[\s\S]*persisted\.balance_after/
    );
  }
);

test(
  "B4 runtime module paths resolve from their actual directories",
  () => {
    assert.match(
      worker,
      /require\(\s*["']\.\.\/\.\.\/\.\.\/\.\.\/supabase["']\s*\)/
    );

    assert.match(
      worker,
      /\.\.\/\.\.\/\.\.\/infrastructure\/cache\/redisClient/
    );

    assert.match(
      worker,
      /\.\.\/\.\.\/\.\.\/foodbook/
    );

    assert.match(
      worker,
      /\.\.\/\.\.\/\.\.\/alerts\/adminAlertService/
    );

    assert.match(
      worker,
      /\.\.\/\.\.\/\.\.\/scheduler\/schedulerHealthService/
    );

    const postCommit =
      read(
        "services/games/cingBlockPuzzle/cingBlockPuzzleContinuePostCommitService.js"
      );

    assert.match(
      postCommit,
      /\.\.\/\.\.\/infrastructure\/cache\/redisClient/
    );

    assert.match(
      postCommit,
      /\.\.\/\.\.\/realtime\/realtimeEventBus/
    );
  }
);
