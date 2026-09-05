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
      /cing_payment_claim_wallet_topup_reconciliation_v1/
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
        "cing_payment_accept_momo_query_success_v1"
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
      migration,
      /status = 'retry'[\s\S]*next_attempt_at/
    );
  }
);


test(
  "expired processing lease is reclaimable",
  () => {
    assert.match(
      migration,
      /status = 'processing'[\s\S]*lease_expires_at <= v_now/
    );

    assert.match(
      migration,
      /for update of j skip locked/
    );
  }
);


test(
  "terminal failure cannot downgrade a durable success",
  () => {
    assert.match(
      migration,
      /settlement_verified_at is not null[\s\S]*settlement_consumed_at is not null[\s\S]*payment_status = 'paid'[\s\S]*WALLET_TOPUP_RECONCILIATION_SUCCESS_ALREADY_DURABLE/
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
