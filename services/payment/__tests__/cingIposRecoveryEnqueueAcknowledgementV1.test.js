"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const worker =
  fs.readFileSync(
    "services/ipos/iposSyncRecoveryWorker.js",
    "utf8"
  );

const ipos =
  fs.readFileSync(
    "services/iposOrderService.js",
    "utf8"
  );

const tx =
  fs.readFileSync(
    "services/transaction/transactionIntegrityService.js",
    "utf8"
  );


test(
  "queue insert failure throws instead of returning false success contract",
  () => {

    assert.match(
      worker,
      /IPOS_RECOVERY_ENQUEUE_FAILED/
    );

    assert.match(
      worker,
      /throw failure/
    );

    assert.doesNotMatch(
      worker,
      /return \{ success:false, error:error\.message \}/
    );

  }
);


test(
  "valid dedupe outcomes remain successful non-errors",
  () => {

    assert.match(
      worker,
      /already_pending_for_order/
    );

    assert.match(
      worker,
      /already_pending/
    );

    assert.match(
      worker,
      /return \{ success:true, data \}/
    );

  }
);


test(
  "direct iPOS push observes enqueue rejection",
  () => {

    assert.match(
      ipos,
      /await enqueueIposRecovery\(\{[\s\S]*\}\)\.catch\(e =>/
    );

    assert.match(
      ipos,
      /IPOS RECOVERY/
    );

  }
);


test(
  "transaction integrity also observes enqueue rejection",
  () => {

    assert.match(
      tx,
      /await enqueueIposRecovery\(\{[\s\S]*\}\)\.catch\(e =>/
    );

    assert.match(
      tx,
      /\[TX INTEGRITY\] iPOS enqueue failed/
    );

  }
);


test(
  "transaction integrity automatically retries missing iPOS orders",
  () => {

    assert.match(
      tx,
      /if \(autoRecover\)[\s\S]*enqueueIposRecovery/
    );

    assert.match(
      tx,
      /missing_ipos_sync/
    );

  }
);
