const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const {
  isWalletMomoTopupEnabled,
  assertWalletMomoTopupEnabled,
} = require(
  "../walletMomoTopupRuntimeGate"
);

const topupService =
  fs.readFileSync(
    path.join(
      __dirname,
      "../../wallet/cingWalletTopupSessionService.js"
    ),
    "utf8"
  );

const worker =
  fs.readFileSync(
    path.join(
      __dirname,
      "../workers/walletTopupReconciliationWorker.js"
    ),
    "utf8"
  );


test(
  "Wallet MoMo top-up entitlement fails closed",
  () => {
    assert.equal(
      isWalletMomoTopupEnabled({}),
      false
    );

    assert.equal(
      isWalletMomoTopupEnabled({
        CING_WALLET_MOMO_TOPUP_ENABLED:
          "",
      }),
      false
    );

    assert.equal(
      isWalletMomoTopupEnabled({
        CING_WALLET_MOMO_TOPUP_ENABLED:
          "false",
      }),
      false
    );

    assert.equal(
      isWalletMomoTopupEnabled({
        CING_WALLET_MOMO_TOPUP_ENABLED:
          "1",
      }),
      false
    );

    assert.equal(
      isWalletMomoTopupEnabled({
        CING_WALLET_MOMO_TOPUP_ENABLED:
          "true",
      }),
      true
    );

    assert.equal(
      isWalletMomoTopupEnabled({
        CING_WALLET_MOMO_TOPUP_ENABLED:
          " TRUE ",
      }),
      true
    );
  }
);


test(
  "disabled entitlement throws stable customer-safe error",
  () => {
    assert.throws(
      () =>
        assertWalletMomoTopupEnabled(
          {}
        ),
      (error) => {
        assert.equal(
          error.code,
          "CING_WALLET_MOMO_TOPUP_DISABLED"
        );

        assert.equal(
          error.statusCode,
          503
        );

        return true;
      }
    );
  }
);


test(
  "top-up session checks entitlement before customer or DB authority",
  () => {
    const functionStart =
      topupService.indexOf(
        "async function createWalletTopupSession({"
      );

    const exportStart =
      topupService.indexOf(
        "module.exports",
        functionStart
      );

    assert.ok(
      functionStart >= 0 &&
      exportStart > functionStart
    );

    const section =
      topupService.slice(
        functionStart,
        exportStart
      );

    const gate =
      section.indexOf(
        "assertWalletMomoTopupEnabled();"
      );

    const identity =
      section.indexOf(
        "resolveWalletUserId("
      );

    const playerLookup =
      section.indexOf(
        "await assertWalletPlayerExists("
      );

    const paymentCreation =
      section.indexOf(
        "await createPaymentSession("
      );

    assert.ok(
      gate >= 0 &&
      identity >= 0 &&
      playerLookup >= 0 &&
      paymentCreation >= 0
    );

    assert.ok(
      gate < identity &&
      identity < playerLookup &&
      playerLookup < paymentCreation
    );
  }
);


test(
  "reconciliation entitlement is checked before durable claim RPC",
  () => {
    const runStart =
      worker.indexOf(
        "async function runWalletTopupReconciliationOnce()"
      );

    const runEnd =
      worker.indexOf(
        "function startWalletTopupReconciliationWorker()",
        runStart
      );

    const runSection =
      worker.slice(
        runStart,
        runEnd
      );

    const gate =
      runSection.indexOf(
        "!isWalletMomoTopupEnabled()"
      );

    const claim =
      runSection.indexOf(
        "cing_payment_claim_wallet_topup_reconciliation_v1"
      );

    assert.ok(
      gate >= 0
    );

    assert.ok(
      claim >= 0
    );

    assert.ok(
      gate < claim
    );

    assert.match(
      runSection,
      /wallet_momo_topup_disabled/
    );
  }
);


test(
  "legacy mutable payment runtime flag is not Wallet MoMo entitlement",
  () => {
    assert.doesNotMatch(
      topupService,
      /reconciliation_enabled|momo_enabled/
    );

    assert.doesNotMatch(
      worker,
      /reconciliation_enabled|momo_enabled/
    );
  }
);
