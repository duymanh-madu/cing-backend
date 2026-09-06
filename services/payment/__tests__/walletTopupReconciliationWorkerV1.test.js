const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");


const worker =
  fs.readFileSync(
    path.join(
      __dirname,
      "../workers/walletTopupReconciliationWorker.js"
    ),
    "utf8"
  );

const migration =
  fs.readFileSync(
    path.join(
      __dirname,
      "../../../db/migrations/20260907_wallet_topup_reconciliation_dual_provider_v2.sql"
    ),
    "utf8"
  );


const legacyMigration =
  fs.readFileSync(
    path.join(
      __dirname,
      "../../../db/migrations/20260905_wallet_topup_reconciliation_authority_v1.sql"
    ),
    "utf8"
  );

const server =
  fs.readFileSync(
    path.join(
      __dirname,
      "../../../server.js"
    ),
    "utf8"
  );


test(
  "worker claims reconciliation jobs from PostgreSQL durable authority",
  () => {
    assert.match(
      worker,
      /cing_payment_claim_wallet_topup_reconciliation_v2/
    );

    assert.doesNotMatch(
      worker,
      /retryQueue\.push/
    );
  }
);


test(
  "worker recovers verified-but-unconsumed payment without provider dependency",
  () => {
    assert.match(
      worker,
      /payment_status ===[\s\S]*"paid"[\s\S]*settlement_verified_at[\s\S]*settleVerifiedTopup/
    );
  }
);


test(
  "successful provider query persists proof before wallet settlement",
  () => {
    const successBranchStart =
      worker.indexOf(
        'queryResult.classification ===\n    "success"'
      );

    assert.ok(
      successBranchStart >= 0,
      "success reconciliation branch must exist"
    );

    const successBranch =
      worker.slice(
        successBranchStart,
        worker.indexOf(
          'queryResult.classification ===\n    "terminal_failure"',
          successBranchStart
        )
      );

    const proof =
      successBranch.indexOf(
        "acceptSuccessRpc"
      );

    const settle =
      successBranch.indexOf(
        "settleVerifiedTopup"
      );

    const complete =
      successBranch.indexOf(
        "completeJob"
      );

    assert.ok(
      proof >= 0 &&
      settle >= 0 &&
      complete >= 0 &&
      proof < settle &&
      settle < complete
    );
  }
);


test(
  "wallet settlement completes before reconciliation job becomes terminal success",
  () => {
    const section =
      worker.slice(
        worker.indexOf(
          'queryResult.classification ===\n    "success"'
        )
      );

    const settle =
      section.indexOf(
        "settleVerifiedTopup"
      );

    const complete =
      section.indexOf(
        "completeJob"
      );

    assert.ok(
      settle >= 0 &&
      complete >= 0 &&
      settle < complete
    );
  }
);


test(
  "network or unknown worker failures remain durable retry candidates",
  () => {
    assert.match(
      worker,
      /catch \(error\)[\s\S]*retryJob/
    );

    assert.match(
      legacyMigration,
      /status\s*=\s*'retry'[\s\S]*next_attempt_at/
    );

    assert.match(
      worker,
      /cing_payment_retry_wallet_topup_reconciliation_v1/
    );
  }
);


test(
  "expired processing lease is reclaimable",
  () => {
    assert.match(
      migration,
      /j\.status\s*=\s*[\s\S]*?'processing'[\s\S]*j\.lease_expires_at\s*<=[\s\S]*?v_now/
    );

    assert.match(
      migration,
      /for update of j[\s\S]*skip locked/
    );
  }
);


test(
  "terminal failure cannot downgrade a durable success",
  () => {
    assert.match(
      migration,
      /settlement_verified_at[\s\S]*is not null[\s\S]*settlement_consumed_at[\s\S]*is not null[\s\S]*payment_status[\s\S]*=[\s\S]*'paid'[\s\S]*WALLET_TOPUP_RECONCILIATION_SUCCESS_ALREADY_DURABLE/
    );
  }
);


test(
  "worker bootstraps automatically on server start",
  () => {
    assert.match(
      server,
      /startWalletTopupReconciliationWorker/
    );

    assert.match(
      server,
      /walletTopupReconciliationWorker/
    );
  }
);


test(
  "retry backoff is capped",
  () => {
    const {
      retryDelaySeconds,
    } = require(
      "../workers/walletTopupReconciliationWorker"
    );

    assert.equal(
      retryDelaySeconds(1),
      30
    );

    assert.equal(
      retryDelaySeconds(2),
      60
    );

    assert.ok(
      retryDelaySeconds(100) <=
        3600
    );
  }
);
