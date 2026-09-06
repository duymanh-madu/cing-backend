const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  processClaimedJob,
} = require(
  "../workers/walletTopupReconciliationWorker"
);


function pendingJob(
  overrides = {}
) {
  return {
    payment_transaction_id:
      101,

    transaction_code:
      "PAY-FAILURE-INJECTION-101",

    payment_status:
      "pending",

    payment_provider:
      "momo",

    amount:
      100000,

    provider_transaction_id:
      "CREATE-REQUEST-ID",

    settlement_verified_at:
      null,

    settlement_verification_method:
      null,

    settlement_reference:
      null,

    settlement_consumed_at:
      null,

    attempt_count:
      1,

    claim_token:
      "11111111-1111-4111-8111-111111111111",

    ...overrides,
  };
}


function successQuery(
  overrides = {}
) {
  return {
    resultCode:
      0,

    classification:
      "success",

    amount:
      100000,

    providerTransactionId:
      "MOMO-TRANS-101",

    message:
      "Successful.",

    ...overrides,
  };
}


test(
  "lost IPN is recovered by provider query then exactly one settlement path",
  async () => {
    const calls = [];

    const rpcCall =
      async (
        name,
        params
      ) => {
        calls.push({
          name,
          params,
        });

        return {};
      };

    let queryCount =
      0;

    const result =
      await processClaimedJob(
        pendingJob(),
        {
          rpcCall,

          queryTransaction:
            async () => {
              queryCount +=
                1;

              return successQuery();
            },
        }
      );

    assert.equal(
      queryCount,
      1
    );

    assert.equal(
      result.action,
      "queried_and_settled"
    );

    assert.deepEqual(
      calls.map(
        (call) =>
          call.name
      ),
      [
        "cing_payment_accept_momo_query_success_v1",
        "cing_wallet_settle_verified_topup_atomic",
        "cing_payment_complete_wallet_topup_reconciliation_v1",
      ]
    );
  }
);


test(
  "durable webhook proof recovers without querying MoMo again",
  async () => {
    let queryCount =
      0;

    const calls = [];

    const result =
      await processClaimedJob(
        pendingJob({
          payment_status:
            "paid",

          settlement_verified_at:
            "2026-09-05T10:00:00.000Z",

          settlement_verification_method:
            "momo_hmac_sha256",

          settlement_reference:
            "MOMO-TRANS-101",
        }),
        {
          rpcCall:
            async (
              name
            ) => {
              calls.push(
                name
              );

              return {};
            },

          queryTransaction:
            async () => {
              queryCount +=
                1;

              throw new Error(
                "query must not execute"
              );
            },
        }
      );

    assert.equal(
      queryCount,
      0
    );

    assert.equal(
      result.action,
      "settled_existing_proof"
    );

    assert.deepEqual(
      calls,
      [
        "cing_wallet_settle_verified_topup_atomic",
        "cing_payment_complete_wallet_topup_reconciliation_v1",
      ]
    );
  }
);


test(
  "crash after provider proof leaves next attempt recoverable without provider dependency",
  async () => {
    const firstCalls =
      [];

    await assert.rejects(
      processClaimedJob(
        pendingJob(),
        {
          queryTransaction:
            async () =>
              successQuery(),

          rpcCall:
            async (
              name
            ) => {
              firstCalls.push(
                name
              );

              if (
                name ===
                "cing_wallet_settle_verified_topup_atomic"
              ) {
                throw new Error(
                  "SIMULATED_PROCESS_FAILURE_AFTER_PROOF"
                );
              }

              return {};
            },
        }
      ),
      /SIMULATED_PROCESS_FAILURE_AFTER_PROOF/
    );

    assert.deepEqual(
      firstCalls,
      [
        "cing_payment_accept_momo_query_success_v1",
        "cing_wallet_settle_verified_topup_atomic",
      ]
    );

    let secondQueryCount =
      0;

    const secondCalls =
      [];

    const recovered =
      await processClaimedJob(
        pendingJob({
          payment_status:
            "paid",

          settlement_verified_at:
            "2026-09-05T10:00:00.000Z",

          settlement_verification_method:
            "momo_status_query_v1",

          settlement_reference:
            "MOMO-TRANS-101",
        }),
        {
          queryTransaction:
            async () => {
              secondQueryCount +=
                1;

              throw new Error(
                "provider must not be required"
              );
            },

          rpcCall:
            async (
              name
            ) => {
              secondCalls.push(
                name
              );

              return {};
            },
        }
      );

    assert.equal(
      secondQueryCount,
      0
    );

    assert.equal(
      recovered.action,
      "settled_existing_proof"
    );

    assert.deepEqual(
      secondCalls,
      [
        "cing_wallet_settle_verified_topup_atomic",
        "cing_payment_complete_wallet_topup_reconciliation_v1",
      ]
    );
  }
);


test(
  "crash after wallet settlement retries same atomic payment identity",
  async () => {
    const calls = [];

    await assert.rejects(
      processClaimedJob(
        pendingJob({
          payment_status:
            "paid",

          settlement_verified_at:
            "2026-09-05T10:00:00.000Z",

          settlement_verification_method:
            "momo_status_query_v1",

          settlement_reference:
            "MOMO-TRANS-101",
        }),
        {
          rpcCall:
            async (
              name,
              params
            ) => {
              calls.push({
                name,
                params,
              });

              if (
                name ===
                "cing_payment_complete_wallet_topup_reconciliation_v1"
              ) {
                throw new Error(
                  "SIMULATED_CRASH_AFTER_WALLET_COMMIT"
                );
              }

              return {};
            },

          queryTransaction:
            async () => {
              throw new Error(
                "provider must not be queried"
              );
            },
        }
      ),
      /SIMULATED_CRASH_AFTER_WALLET_COMMIT/
    );

    assert.equal(
      calls[0].name,
      "cing_wallet_settle_verified_topup_atomic"
    );

    assert.equal(
      calls[0]
        .params
        .p_payment_transaction_id,
      101
    );

    assert.equal(
      calls[1].name,
      "cing_payment_complete_wallet_topup_reconciliation_v1"
    );
  }
);


test(
  "pending MoMo state never enters settlement authority",
  async () => {
    const calls = [];

    const result =
      await processClaimedJob(
        pendingJob(),
        {
          queryTransaction:
            async () => ({
              resultCode:
                1000,

              classification:
                "retry",

              providerTransactionId:
                null,

              message:
                "Transaction is processing.",
            }),

          rpcCall:
            async (
              name
            ) => {
              calls.push(
                name
              );

              return {};
            },
        }
      );

    assert.equal(
      result.action,
      "retry_scheduled"
    );

    assert.deepEqual(
      calls,
      [
        "cing_payment_retry_wallet_topup_reconciliation_v1",
      ]
    );
  }
);


test(
  "unknown MoMo state remains retryable and never credits Wallet",
  async () => {
    const calls = [];

    const result =
      await processClaimedJob(
        pendingJob(),
        {
          queryTransaction:
            async () => ({
              resultCode:
                987654,

              classification:
                "retry",

              providerTransactionId:
                null,

              message:
                "Unknown provider state",
            }),

          rpcCall:
            async (
              name
            ) => {
              calls.push(
                name
              );

              return {};
            },
        }
      );

    assert.equal(
      result.action,
      "retry_scheduled"
    );

    assert.equal(
      calls.includes(
        "cing_wallet_settle_verified_topup_atomic"
      ),
      false
    );

    assert.equal(
      calls.includes(
        "cing_payment_accept_momo_query_success_v1"
      ),
      false
    );
  }
);


test(
  "terminal provider failure never enters Wallet settlement",
  async () => {
    const calls = [];

    const result =
      await processClaimedJob(
        pendingJob(),
        {
          queryTransaction:
            async () => ({
              resultCode:
                1006,

              classification:
                "terminal_failure",

              providerTransactionId:
                "MOMO-TRANS-FAIL-101",

              message:
                "Transaction expired.",
            }),

          rpcCall:
            async (
              name
            ) => {
              calls.push(
                name
              );

              return {};
            },
        }
      );

    assert.equal(
      result.action,
      "terminal_failed"
    );

    assert.deepEqual(
      calls,
      [
        "cing_payment_terminal_fail_wallet_topup_reconciliation_v2",
      ]
    );
  }
);


test(
  "provider network failure cannot reach proof or Wallet credit",
  async () => {
    const calls = [];

    await assert.rejects(
      processClaimedJob(
        pendingJob(),
        {
          queryTransaction:
            async () => {
              throw new Error(
                "ECONNRESET"
              );
            },

          rpcCall:
            async (
              name
            ) => {
              calls.push(
                name
              );

              return {};
            },
        }
      ),
      /ECONNRESET/
    );

    assert.deepEqual(
      calls,
      []
    );
  }
);
