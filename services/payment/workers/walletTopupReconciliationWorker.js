const supabase =
  require("../../../supabase");

const {
  queryMomoTransaction,
} = require(
  "../momoTransactionQueryService"
);

const {
  isWalletMomoTopupEnabled,
} = require(
  "../walletMomoTopupRuntimeGate"
);


const DEFAULT_INTERVAL_MS =
  30000;

const DEFAULT_BATCH_SIZE =
  20;

const DEFAULT_LEASE_SECONDS =
  120;

const DEFAULT_GRACE_SECONDS =
  45;

let timer = null;
let running = false;


function positiveIntegerEnv(
  name,
  fallback
) {
  const raw =
    process.env[name];

  if (
    raw === undefined ||
    raw === null ||
    String(raw).trim() === ""
  ) {
    return fallback;
  }

  const value =
    Number(raw);

  if (
    !Number.isSafeInteger(
      value
    ) ||
    value <= 0
  ) {
    throw new Error(
      `${name}_INVALID`
    );
  }

  return value;
}


function retryDelaySeconds(
  attemptCount
) {
  const attempt =
    Math.max(
      1,
      Number(
        attemptCount
      ) || 1
    );

  /*
   * 30s, 60s, 120s, 240s...
   * capped at 1 hour.
   */
  return Math.min(
    3600,
    30 *
      Math.pow(
        2,
        Math.min(
          attempt - 1,
          7
        )
      )
  );
}


async function rpc(
  name,
  params
) {
  const {
    data,
    error,
  } = await supabase.rpc(
    name,
    params
  );

  if (error) {
    const wrapped =
      new Error(
        error.message
      );

    wrapped.code =
      error.code;

    throw wrapped;
  }

  return data;
}


function firstRow(
  data
) {
  if (
    Array.isArray(data)
  ) {
    return data[0] || null;
  }

  return data || null;
}


async function settleVerifiedTopup(
  paymentTransactionId,
  rpcCall = rpc
) {
  await rpcCall(
    "cing_wallet_settle_verified_topup_atomic",
    {
      p_payment_transaction_id:
        paymentTransactionId,
    }
  );
}


async function completeJob(
  job,
  rpcCall = rpc
) {
  await rpcCall(
    "cing_payment_complete_wallet_topup_reconciliation_v1",
    {
      p_payment_transaction_id:
        job.payment_transaction_id,

      p_claim_token:
        job.claim_token,
    }
  );
}


async function retryJob({
  job,
  resultCode = null,
  error,
  rpcCall = rpc,
}) {
  await rpcCall(
    "cing_payment_retry_wallet_topup_reconciliation_v1",
    {
      p_payment_transaction_id:
        job.payment_transaction_id,

      p_claim_token:
        job.claim_token,

      p_delay_seconds:
        retryDelaySeconds(
          job.attempt_count
        ),

      p_result_code:
        resultCode,

      p_error:
        String(
          error?.message ||
          error ||
          "retry_required"
        ),
    }
  );
}


async function terminalFailJob({
  job,
  queryResult,
  rpcCall = rpc,
}) {
  await rpcCall(
    "cing_payment_terminal_fail_wallet_topup_reconciliation_v1",
    {
      p_payment_transaction_id:
        job.payment_transaction_id,

      p_claim_token:
        job.claim_token,

      p_result_code:
        queryResult.resultCode,

      p_provider_transaction_id:
        queryResult.providerTransactionId,

      p_error:
        queryResult.message ||
        `MoMo terminal resultCode ${queryResult.resultCode}`,
    }
  );
}


async function processClaimedJob(
  job,
  {
    rpcCall = rpc,
    queryTransaction = queryMomoTransaction,
  } = {}
) {
  /*
   * Recovery path #1:
   * webhook already made provider proof durable but process died
   * before Wallet settlement.
   *
   * No provider call is needed.
   */
  if (
    job.payment_status ===
      "paid" &&
    job.settlement_verified_at
  ) {
    await settleVerifiedTopup(
      job.payment_transaction_id,
      rpcCall
    );

    await completeJob(
      job,
      rpcCall
    );

    return {
      action:
        "settled_existing_proof",
    };
  }

  /*
   * Recovery path #2:
   * no durable settlement proof exists.
   * Query MoMo authority directly.
   */
  const queryResult =
    await queryTransaction({
      transactionCode:
        job.transaction_code,

      amount:
        Number(
          job.amount
        ),
    });

  if (
    queryResult.classification ===
    "success"
  ) {
    await rpcCall(
      "cing_payment_accept_momo_query_success_v1",
      {
        p_payment_transaction_id:
          job.payment_transaction_id,

        p_claim_token:
          job.claim_token,

        p_provider_transaction_id:
          queryResult.providerTransactionId,

        p_provider_amount:
          queryResult.amount,
      }
    );

    await settleVerifiedTopup(
      job.payment_transaction_id,
      rpcCall
    );

    await completeJob(
      job,
      rpcCall
    );

    return {
      action:
        "queried_and_settled",
      resultCode:
        queryResult.resultCode,
    };
  }

  if (
    queryResult.classification ===
    "terminal_failure"
  ) {
    await terminalFailJob({
      job,
      queryResult,
      rpcCall,
    });

    return {
      action:
        "terminal_failed",
      resultCode:
        queryResult.resultCode,
    };
  }

  await retryJob({
    job,
    resultCode:
      queryResult.resultCode,
    error:
      queryResult.message ||
      `MoMo pending resultCode ${queryResult.resultCode}`,
    rpcCall,
  });

  return {
    action:
      "retry_scheduled",
    resultCode:
      queryResult.resultCode,
  };
}


async function runWalletTopupReconciliationOnce() {
  /*
   * Financial entitlement must be checked before the
   * PostgreSQL claim RPC. Disabled means:
   * - no lease acquisition
   * - no provider query
   * - no Wallet mutation
   */
  if (
    !isWalletMomoTopupEnabled()
  ) {
    return {
      skipped:
        true,
      reason:
        "wallet_momo_topup_disabled",
    };
  }

  if (running) {
    return {
      skipped:
        true,
      reason:
        "local_run_in_progress",
    };
  }

  running = true;

  try {
    const batchSize =
      positiveIntegerEnv(
        "WALLET_TOPUP_RECONCILIATION_BATCH_SIZE",
        DEFAULT_BATCH_SIZE
      );

    const leaseSeconds =
      positiveIntegerEnv(
        "WALLET_TOPUP_RECONCILIATION_LEASE_SECONDS",
        DEFAULT_LEASE_SECONDS
      );

    const graceSeconds =
      positiveIntegerEnv(
        "WALLET_TOPUP_RECONCILIATION_GRACE_SECONDS",
        DEFAULT_GRACE_SECONDS
      );

    const claimed =
      await rpc(
        "cing_payment_claim_wallet_topup_reconciliation_v1",
        {
          p_batch_size:
            batchSize,

          p_lease_seconds:
            leaseSeconds,

          p_grace_seconds:
            graceSeconds,
        }
      );

    const jobs =
      Array.isArray(
        claimed
      )
        ? claimed
        : claimed
          ? [claimed]
          : [];

    const summary = {
      claimed:
        jobs.length,
      settled:
        0,
      terminalFailed:
        0,
      retried:
        0,
      errors:
        0,
    };

    for (
      const job of jobs
    ) {
      try {
        const result =
          await processClaimedJob(
            job
          );

        if (
          result.action ===
            "settled_existing_proof" ||
          result.action ===
            "queried_and_settled"
        ) {
          summary.settled +=
            1;
        } else if (
          result.action ===
          "terminal_failed"
        ) {
          summary.terminalFailed +=
            1;
        } else if (
          result.action ===
          "retry_scheduled"
        ) {
          summary.retried +=
            1;
        }
      } catch (error) {
        summary.errors +=
          1;

        /*
         * Unknown network/provider/DB errors remain retryable.
         *
         * If fail/retry RPC itself cannot commit, the lease expires
         * and PostgreSQL will reclaim the job automatically.
         */
        try {
          await retryJob({
            job,
            error,
          });

          summary.retried +=
            1;
        } catch (
          retryError
        ) {
          console.error(
            "[WALLET TOPUP RECONCILIATION] retry persistence failed",
            {
              payment_transaction_id:
                job.payment_transaction_id,
              error:
                retryError.message,
            }
          );
        }
      }
    }

    return summary;
  } finally {
    running = false;
  }
}


function startWalletTopupReconciliationWorker() {
  if (timer) {
    return timer;
  }

  const intervalMs =
    positiveIntegerEnv(
      "WALLET_TOPUP_RECONCILIATION_INTERVAL_MS",
      DEFAULT_INTERVAL_MS
    );

  const tick = () => {
    runWalletTopupReconciliationOnce()
      .catch(
        (error) => {
          console.error(
            "[WALLET TOPUP RECONCILIATION] tick failed:",
            error.message
          );
        }
      );
  };

  timer =
    setInterval(
      tick,
      intervalMs
    );

  if (
    typeof timer.unref ===
    "function"
  ) {
    timer.unref();
  }

  tick();

  return timer;
}


function stopWalletTopupReconciliationWorker() {
  if (timer) {
    clearInterval(
      timer
    );

    timer = null;
  }
}


module.exports = {
  retryDelaySeconds,
  settleVerifiedTopup,
  completeJob,
  retryJob,
  terminalFailJob,
  processClaimedJob,
  runWalletTopupReconciliationOnce,
  startWalletTopupReconciliationWorker,
  stopWalletTopupReconciliationWorker,
};
