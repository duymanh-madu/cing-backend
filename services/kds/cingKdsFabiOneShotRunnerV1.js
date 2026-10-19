"use strict";

/*
 * Cing KDS FABi One-Shot Fenced Runner V1
 *
 * Control-plane authority only.
 *
 * It owns one atomic scheduling attempt for one exact FABi
 * branch. It does NOT own:
 *
 * - setInterval / cron
 * - server mounting
 * - environment loading
 * - Supabase construction
 * - FABi authentication
 *
 * Correctness order:
 *
 *   branch lease
 *   -> recovery window
 *   -> C04/C03 runtime poll
 *   -> durable transaction result queue
 *   -> due C03 retry claims
 *   -> fenced checkpoint commit
 *
 * Checkpoint commit is forbidden until all transaction results
 * from the current C04 poll have durable queue authority.
 */

const {
  planFabiC04RecoveryWindowV1
} = require(
  "./cingKdsFabiRuntimeWindowPlannerV1"
);

const RESULT_STATUS =
  new Set([
    "pending_c03",
    "ready",
    "review_required"
  ]);

function runnerError(
  code
) {
  const error =
    new Error(code);

  error.code =
    code;

  return error;
}

function requiredFunction(
  value,
  code
) {
  if (
    typeof value !==
      "function"
  ) {
    throw runnerError(code);
  }

  return value;
}

function requiredCapability(
  object,
  name,
  code
) {
  if (
    !object ||
    typeof object !==
      "object" ||
    typeof object[name] !==
      "function"
  ) {
    throw runnerError(code);
  }

  return object[name];
}

function requiredString(
  value,
  code
) {
  if (
    typeof value !==
      "string" ||
    value.trim().length === 0
  ) {
    throw runnerError(code);
  }

  return value.trim();
}

function positiveInteger(
  value,
  code
) {
  const number =
    Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 1
  ) {
    throw runnerError(code);
  }

  return number;
}

function nonnegativeInteger(
  value,
  code
) {
  const number =
    Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 0
  ) {
    throw runnerError(code);
  }

  return number;
}

function validateScope(
  scope
) {
  if (
    !scope ||
    typeof scope !==
      "object"
  ) {
    throw runnerError(
      "KDS_RUN_SCOPE_INVALID"
    );
  }

  return Object.freeze({
    company_uid:
      requiredString(
        scope.company_uid,
        "KDS_RUN_COMPANY_REQUIRED"
      ),

    brand_uid:
      requiredString(
        scope.brand_uid,
        "KDS_RUN_BRAND_REQUIRED"
      ),

    store_uid:
      requiredString(
        scope.store_uid,
        "KDS_RUN_STORE_REQUIRED"
      )
  });
}

function validateFingerprint(
  value
) {
  if (
    typeof value !==
      "string" ||
    !/^[a-f0-9]{64}$/.test(
      value
    )
  ) {
    throw runnerError(
      "KDS_RUN_STATE_FINGERPRINT_REQUIRED"
    );
  }

  return value;
}

function validateStatus(
  value
) {
  if (
    typeof value !==
      "string" ||
    !RESULT_STATUS.has(
      value
    )
  ) {
    throw runnerError(
      "KDS_RUN_RECON_STATUS_INVALID"
    );
  }

  return value;
}

function optionalRetryDelay(
  status,
  value
) {
  if (status !== "pending_c03") {
    if (
      value !== null &&
      value !== undefined
    ) {
      throw runnerError(
        "KDS_RUN_RETRY_DELAY_INVALID"
      );
    }

    return null;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const delay = positiveInteger(
    value,
    "KDS_RUN_RETRY_DELAY_INVALID"
  );

  if (delay > 32_400) {
    throw runnerError(
      "KDS_RUN_RETRY_DELAY_INVALID"
    );
  }

  return delay;
}

function validateC03Eligibility(
  value
) {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.eligible !== "boolean"
  ) {
    throw runnerError(
      "KDS_RUN_C03_ELIGIBILITY_INVALID"
    );
  }

  const delay = optionalRetryDelay(
    value.eligible === true
      ? "ready"
      : "pending_c03",
    value.retry_delay_seconds
  );

  return Object.freeze({
    eligible: value.eligible,
    retry_delay_seconds: delay
  });
}

function validatePollResult(
  result
) {
  if (
    !result ||
    typeof result !==
      "object" ||
    !Array.isArray(
      result.transactions
    )
  ) {
    throw runnerError(
      "KDS_RUN_POLL_RESULT_INVALID"
    );
  }

  return Object.freeze(
    result.transactions.map(
      transaction => {
        if (
          !transaction ||
          typeof transaction !==
            "object"
        ) {
          throw runnerError(
            "KDS_RUN_TRANSACTION_RESULT_INVALID"
          );
        }

        /*
         * Critical checkpoint gate.
         *
         * Example:
         * durable event fingerprint conflict can be classified
         * review_required before reducer projection and therefore
         * has no state_fingerprint.
         *
         * Such a transaction MUST block checkpoint advancement.
         */
        const fingerprint =
          validateFingerprint(
            transaction
              .state_fingerprint
          );

        return Object.freeze({
          tran_id:
            requiredString(
              transaction.tran_id,
              "KDS_RUN_TRAN_ID_REQUIRED"
            ),

          status:
            validateStatus(
              transaction.status
            ),

          retry_delay_seconds:
            optionalRetryDelay(
              transaction.status,
              transaction.retry_delay_seconds
            ),

          state_fingerprint:
            fingerprint
        });
      }
    )
  );
}

function validateRetryResult(
  result
) {
  if (
    !result ||
    typeof result !==
      "object"
  ) {
    throw runnerError(
      "KDS_RUN_RETRY_RESULT_INVALID"
    );
  }

  return Object.freeze({
    status:
      validateStatus(
        result.status
      ),

    retry_delay_seconds:
      optionalRetryDelay(
        result.status,
        result.retry_delay_seconds
      ),

    state_fingerprint:
      validateFingerprint(
        result.state_fingerprint
      )
  });
}

function createFabiKdsOneShotRunnerV1({
  scopeProvider,
  nowProvider,

  runtimeLeaseAdapter,
  reconciliationQueueAdapter,

  createPollRuntime,
  retryTransaction,

  c03EligibilityProvider =
    async () => ({
      eligible: true,
      retry_delay_seconds: null
    }),

  windowPlanner =
    planFabiC04RecoveryWindowV1,

  branchLeaseSeconds = 120,

  overlapMs = 60_000,
  settleLagMs = 5_000,
  maxAdvanceMs = 15 * 60_000,
  bootstrapLookbackMs = 15 * 60_000,

  pendingRetryDelaySeconds = 10,
  retryBatchSize = 1,
  retryLeaseSeconds = 120
} = {}) {
  requiredFunction(
    scopeProvider,
    "KDS_RUN_SCOPE_PROVIDER_REQUIRED"
  );

  requiredFunction(
    nowProvider,
    "KDS_RUN_NOW_PROVIDER_REQUIRED"
  );

  requiredFunction(
    windowPlanner,
    "KDS_RUN_WINDOW_PLANNER_REQUIRED"
  );

  const acquireLease =
    requiredCapability(
      runtimeLeaseAdapter,
      "acquire",
      "KDS_RUN_LEASE_ACQUIRE_REQUIRED"
    );

  const commitCheckpoint =
    requiredCapability(
      runtimeLeaseAdapter,
      "commit",
      "KDS_RUN_LEASE_COMMIT_REQUIRED"
    );

  const renewLease =
    requiredCapability(
      runtimeLeaseAdapter,
      "renew",
      "KDS_RUN_LEASE_RENEW_REQUIRED"
    );

  const releaseLease =
    requiredCapability(
      runtimeLeaseAdapter,
      "release",
      "KDS_RUN_LEASE_RELEASE_REQUIRED"
    );

  const putResult =
    requiredCapability(
      reconciliationQueueAdapter,
      "putResult",
      "KDS_RUN_QUEUE_PUT_REQUIRED"
    );

  const claimDue =
    requiredCapability(
      reconciliationQueueAdapter,
      "claimDue",
      "KDS_RUN_QUEUE_CLAIM_REQUIRED"
    );

  const resolveClaim =
    requiredCapability(
      reconciliationQueueAdapter,
      "resolveClaim",
      "KDS_RUN_QUEUE_RESOLVE_REQUIRED"
    );

  requiredFunction(
    createPollRuntime,
    "KDS_RUN_RUNTIME_FACTORY_REQUIRED"
  );

  requiredFunction(
    retryTransaction,
    "KDS_RUN_RETRY_TRANSACTION_REQUIRED"
  );

  requiredFunction(
    c03EligibilityProvider,
    "KDS_RUN_C03_ELIGIBILITY_PROVIDER_REQUIRED"
  );

  const branchLease =
    positiveInteger(
      branchLeaseSeconds,
      "KDS_RUN_BRANCH_LEASE_INVALID"
    );

  const overlap =
    nonnegativeInteger(
      overlapMs,
      "KDS_RUN_OVERLAP_INVALID"
    );

  const settleLag =
    nonnegativeInteger(
      settleLagMs,
      "KDS_RUN_SETTLE_LAG_INVALID"
    );

  const maxAdvance =
    positiveInteger(
      maxAdvanceMs,
      "KDS_RUN_MAX_ADVANCE_INVALID"
    );

  const bootstrapLookback =
    positiveInteger(
      bootstrapLookbackMs,
      "KDS_RUN_BOOTSTRAP_INVALID"
    );

  const retryDelay =
    positiveInteger(
      pendingRetryDelaySeconds,
      "KDS_RUN_RETRY_DELAY_INVALID"
    );

  const retryBatch =
    positiveInteger(
      retryBatchSize,
      "KDS_RUN_RETRY_BATCH_INVALID"
    );

  const retryLease =
    positiveInteger(
      retryLeaseSeconds,
      "KDS_RUN_RETRY_LEASE_INVALID"
    );

  if (
    branchLease < 30 ||
    branchLease > 900
  ) {
    throw runnerError(
      "KDS_RUN_BRANCH_LEASE_INVALID"
    );
  }

  if (
    retryDelay > 32_400
  ) {
    throw runnerError(
      "KDS_RUN_RETRY_DELAY_INVALID"
    );
  }

  if (
    retryBatch > 1
  ) {
    throw runnerError(
      "KDS_RUN_RETRY_BATCH_INVALID"
    );
  }

  if (
    retryLease < 30 ||
    retryLease > 900
  ) {
    throw runnerError(
      "KDS_RUN_RETRY_LEASE_INVALID"
    );
  }

  let running =
    false;

  async function safeRelease(
    scope,
    token
  ) {
    try {
      await releaseLease({
        scope,
        lease_token:
          token
      });
    } catch (_) {
      /*
       * Preserve the original failure.
       *
       * Lease expiry/fencing remains the final safety boundary.
       */
    }
  }

  async function processDueRetries(
    scope,
    leaseGuard
  ) {
    await leaseGuard();

    const claims =
      await claimDue({
        scope,

        batch_size:
          retryBatch,

        lease_seconds:
          retryLease
      });

    if (
      !Array.isArray(claims)
    ) {
      throw runnerError(
        "KDS_RUN_RETRY_CLAIMS_INVALID"
      );
    }

    let resolved =
      0;

    for (
      const claim
      of claims
    ) {
      await leaseGuard();

      if (
        !claim ||
        typeof claim !==
          "object"
      ) {
        throw runnerError(
          "KDS_RUN_RETRY_CLAIM_INVALID"
        );
      }

      const tranId =
        requiredString(
          claim.tran_id,
          "KDS_RUN_RETRY_TRAN_ID_INVALID"
        );

      const claimToken =
        requiredString(
          claim.claim_token,
          "KDS_RUN_RETRY_CLAIM_TOKEN_INVALID"
        );

      const version =
        positiveInteger(
          claim.result_version,
          "KDS_RUN_RETRY_VERSION_INVALID"
        );

      const c03Eligibility =
        validateC03Eligibility(
          await c03EligibilityProvider()
        );

      const result =
        c03Eligibility.eligible === true
          ? validateRetryResult(
              await retryTransaction({
                scope,

                tran_id:
                  tranId,

                state_fingerprint:
                  validateFingerprint(
                    claim.state_fingerprint
                  ),

                attempt_count:
                  positiveInteger(
                    claim.attempt_count,
                    "KDS_RUN_RETRY_ATTEMPT_INVALID"
                  ),

                beforeExternalOperation:
                  leaseGuard
              })
            )
          : Object.freeze({
              status:
                "pending_c03",

              state_fingerprint:
                validateFingerprint(
                  claim.state_fingerprint
                ),

              retry_delay_seconds:
                c03Eligibility
                  .retry_delay_seconds
            });

      await leaseGuard();

      await resolveClaim({
        scope,

        tran_id:
          tranId,

        claim_token:
          claimToken,

        expected_result_version:
          version,

        status:
          result.status,

        state_fingerprint:
          result
            .state_fingerprint,

        retry_delay_seconds:
          result.status ===
            "pending_c03"
            ? result.retry_delay_seconds ??
              retryDelay
            : null
      });

      resolved++;
    }

    return Object.freeze({
      claimed:
        claims.length,

      resolved
    });
  }

  async function runOnce() {
    if (running) {
      throw runnerError(
        "KDS_RUN_ALREADY_RUNNING"
      );
    }

    running =
      true;

    let scope =
      null;

    let leaseToken =
      null;

    let leaseCommitted =
      false;

    try {
      scope =
        validateScope(
          await scopeProvider()
        );

      const lease =
        await acquireLease({
          scope,

          lease_seconds:
            branchLease
        });

      if (
        !lease ||
        typeof lease !==
          "object" ||
        typeof lease.acquired !==
          "boolean"
      ) {
        throw runnerError(
          "KDS_RUN_LEASE_RESULT_INVALID"
        );
      }

      if (
        lease.acquired !==
          true
      ) {
        return Object.freeze({
          status:
            "lease_busy",

          polled:
            false,

          checkpoint_committed:
            false,

          transaction_count:
            0,

          retries_claimed:
            0,

          retries_resolved:
            0
        });
      }

      leaseToken =
        requiredString(
          lease.lease_token,
          "KDS_RUN_LEASE_TOKEN_INVALID"
        );

      async function renewCurrentLease() {
        const renewal =
          await renewLease({
            scope,

            lease_token:
              leaseToken,

            lease_seconds:
              branchLease
          });

        if (
          !renewal ||
          renewal.renewed !== true
        ) {
          throw runnerError(
            "KDS_RUN_LEASE_RENEW_DENIED"
          );
        }
      }

      const nowMs =
        nonnegativeInteger(
          await nowProvider(),
          "KDS_RUN_NOW_INVALID"
        );

      const plan =
        windowPlanner({
          now_ms:
            nowMs,

          checkpoint_end_ms:
            lease
              .checkpoint_end_ms ??
            null,

          overlap_ms:
            overlap,

          settle_lag_ms:
            settleLag,

          max_advance_ms:
            maxAdvance,

          bootstrap_lookback_ms:
            bootstrapLookback
        });

      if (
        !plan ||
        typeof plan !==
          "object" ||
        typeof plan.should_poll !==
          "boolean"
      ) {
        throw runnerError(
          "KDS_RUN_WINDOW_PLAN_INVALID"
        );
      }

      let transactionCount =
        0;

      let fetchedEventCount =
        0;

      let durableEventCount =
        0;

      if (
        plan.should_poll ===
          true
      ) {
        await renewCurrentLease();

        const c03Eligibility =
          validateC03Eligibility(
            await c03EligibilityProvider()
          );

        const runtime =
          createPollRuntime({
            scope,

            window:
              Object.freeze({
                start_date:
                  plan.start_date,

                end_date:
                  plan.end_date,

                /*
                 * Scheduling metadata only.
                 */
                next_cursor:
                  plan
                    .checkpoint_commit_ms
              }),

            beforeExternalOperation:
              renewCurrentLease,

            c03Eligibility
          });

        if (
          !runtime ||
          typeof runtime.poll !==
            "function" ||
          typeof runtime.close !==
            "function"
        ) {
          throw runnerError(
            "KDS_RUN_RUNTIME_INVALID"
          );
        }

        let pollResult;

        try {
          pollResult =
            await runtime.poll({
              cursor:
                lease
                  .checkpoint_end_ms ??
                null
            });
        } finally {
          runtime.close();
        }

        /*
         * Validate ALL transaction outputs before the first
         * queue mutation. A conflict result lacking projected
         * state fingerprint blocks checkpoint advancement.
         */
        const transactions =
          validatePollResult(
            pollResult
          );

        fetchedEventCount =
          nonnegativeInteger(
            pollResult
              .fetched_event_count ??
              0,
            "KDS_RUN_FETCH_COUNT_INVALID"
          );

        durableEventCount =
          nonnegativeInteger(
            pollResult
              .durable_event_count ??
              0,
            "KDS_RUN_DURABLE_COUNT_INVALID"
          );

        /*
         * Critical zero-missing boundary:
         *
         * Every transaction from this successful C04 poll must
         * gain durable transaction-level authority before the
         * branch checkpoint can advance.
         */
        for (
          const transaction
          of transactions
        ) {
          await renewCurrentLease();

          await putResult({
            scope,

            tran_id:
              transaction.tran_id,

            status:
              transaction.status,

            state_fingerprint:
              transaction
                .state_fingerprint,

            retry_delay_seconds:
              transaction.status ===
                "pending_c03"
                ? transaction.retry_delay_seconds ??
                  retryDelay
                : null
          });
        }

        transactionCount =
          transactions.length;
      }

      /*
       * Existing durable pending transactions remain recoverable
       * even when this C04 window is already caught up.
       */
      const retryResult =
        await processDueRetries(
          scope,
          renewCurrentLease
        );

      if (
        plan.should_poll !==
          true
      ) {
        await releaseLease({
          scope,

          lease_token:
            leaseToken
        });

        leaseToken =
          null;

        return Object.freeze({
          status:
            "caught_up",

          polled:
            false,

          checkpoint_committed:
            false,

          transaction_count:
            0,

          fetched_event_count:
            0,

          durable_event_count:
            0,

          retries_claimed:
            retryResult.claimed,

          retries_resolved:
            retryResult.resolved
        });
      }

      /*
       * ONLY HERE may the C04 scheduling checkpoint advance.
       *
       * We commit the planner's bounded safe end.
       * runtime.next_cursor is deliberately not trusted as
       * correctness authority.
       */
      await renewCurrentLease();

      const commit =
        await commitCheckpoint({
          scope,

          lease_token:
            leaseToken,

          checkpoint_end_ms:
            nonnegativeInteger(
              plan
                .checkpoint_commit_ms,
              "KDS_RUN_CHECKPOINT_INVALID"
            )
        });

      if (
        !commit ||
        commit.committed !==
          true
      ) {
        throw runnerError(
          "KDS_RUN_CHECKPOINT_NOT_COMMITTED"
        );
      }

      leaseCommitted =
        true;

      leaseToken =
        null;

      return Object.freeze({
        status:
          "committed",

        polled:
          true,

        checkpoint_committed:
          true,

        checkpoint_end_ms:
          plan
            .checkpoint_commit_ms,

        transaction_count:
          transactionCount,

        fetched_event_count:
          fetchedEventCount,

        durable_event_count:
          durableEventCount,

        retries_claimed:
          retryResult.claimed,

        retries_resolved:
          retryResult.resolved
      });
    } catch (error) {
      if (
        scope &&
        leaseToken &&
        !leaseCommitted
      ) {
        await safeRelease(
          scope,
          leaseToken
        );
      }

      throw error;
    } finally {
      running =
        false;
    }
  }

  function status() {
    return Object.freeze({
      running
    });
  }

  return Object.freeze({
    runOnce,
    status
  });
}

module.exports = {
  createFabiKdsOneShotRunnerV1
};
