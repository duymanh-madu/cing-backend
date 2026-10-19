"use strict";

/*
 * Cing KDS FABi Dormant Runtime Composition V1
 *
 * Real composition boundary:
 *
 *   One-shot fenced branch runner
 *     -> real C04/C03 runtime composition
 *     -> real branch-scoped durable C04 reload
 *     -> real signed-delta state projection
 *     -> real C03 final reconciliation
 *     -> durable reconciliation queue
 *     -> fenced checkpoint
 *
 * This module intentionally owns NO:
 *
 *   process.env
 *   Supabase construction
 *   FABi credential construction
 *   timers / cron
 *   server / route mounting
 */

const {
  createFabiKdsRuntimeCompositionV1
} = require(
  "./cingKdsFabiRuntimeCompositionV1"
);

const {
  createFabiKdsOneShotRunnerV1
} = require(
  "./cingKdsFabiOneShotRunnerV1"
);

const {
  projectFabiC04StateV1
} = require(
  "./cingKdsFabiC04SignedDeltaReducerV1"
);

const {
  createFabiC03FinalFetchBridgeV1
} = require(
  "./cingKdsFabiC03FinalFetchBridgeV1"
);

const {
  createFabiC03FinalReconciliationAdapterV1
} = require(
  "./cingKdsFabiC03FinalReconciliationAdapterV1"
);

const {
  createFabiC03HistoricalWindowProviderV1
} = require(
  "./cingKdsFabiC03HistoricalWindowProviderV1"
);

const {
  createFabiC03RecoveryWindowProviderV1
} = require(
  "./cingKdsFabiC03RecoveryWindowProviderV1"
);

const {
  planFabiKdsClosedHoursV1
} = require(
  "./cingKdsFabiClosedHoursPolicyV1"
);

function compositionError(
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
    throw compositionError(
      code
    );
  }

  return value;
}

function requiredMethod(
  object,
  method,
  code
) {
  if (
    !object ||
    typeof object !==
      "object" ||
    typeof object[method] !==
      "function"
  ) {
    throw compositionError(
      code
    );
  }

  return object[method];
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
    throw compositionError(
      code
    );
  }

  return value.trim();
}

function validateScope(
  scope
) {
  if (
    !scope ||
    typeof scope !==
      "object"
  ) {
    throw compositionError(
      "KDS_DORMANT_SCOPE_INVALID"
    );
  }

  return Object.freeze({
    company_uid:
      requiredString(
        scope.company_uid,
        "KDS_DORMANT_COMPANY_REQUIRED"
      ),

    brand_uid:
      requiredString(
        scope.brand_uid,
        "KDS_DORMANT_BRAND_REQUIRED"
      ),

    store_uid:
      requiredString(
        scope.store_uid,
        "KDS_DORMANT_STORE_REQUIRED"
      )
  });
}

function validateFingerprint(
  value,
  code =
    "KDS_DORMANT_STATE_FINGERPRINT_INVALID"
) {
  if (
    typeof value !==
      "string" ||
    !/^[a-f0-9]{64}$/.test(
      value
    )
  ) {
    throw compositionError(
      code
    );
  }

  return value;
}

/*
 * Exact mapping used by the current ingest coordinator:
 *
 * C03 matched
 *   -> ready
 *
 * C03 not final yet
 *   -> pending_c03
 *
 * C03 final mismatch
 *   -> review_required
 */
function classifyRetryReconciliationV1(
  result
) {
  if (
    !result ||
    typeof result !==
      "object" ||
    result.authority !==
      "c03_paid_final"
  ) {
    throw compositionError(
      "KDS_DORMANT_RECON_AUTHORITY_INVALID"
    );
  }

  if (
    result.matched === true
  ) {
    return "ready";
  }

  if (
    result.matched !== false
  ) {
    throw compositionError(
      "KDS_DORMANT_RECON_RESULT_INVALID"
    );
  }

  if (
    result.status ===
      "not_final_yet"
  ) {
    return "pending_c03";
  }

  if (
    result.status ===
      "mismatch"
  ) {
    return "review_required";
  }

  throw compositionError(
    "KDS_DORMANT_RECON_RESULT_INVALID"
  );
}

/*
 * Transaction-level retry authority.
 *
 * Important:
 * - reload is exact branch + tran
 * - projection is rebuilt from durable C04 history
 * - claim fingerprint must still equal projected fingerprint
 * - C03 remains final reconciliation authority
 */
function createFabiKdsRetryTransactionV1({
  loadDurableEvents,
  projectState =
    projectFabiC04StateV1,
  reconcileWithC03
} = {}) {
  requiredFunction(
    loadDurableEvents,
    "KDS_DORMANT_RETRY_LOADER_REQUIRED"
  );

  requiredFunction(
    projectState,
    "KDS_DORMANT_RETRY_PROJECTOR_REQUIRED"
  );

  requiredFunction(
    reconcileWithC03,
    "KDS_DORMANT_RETRY_RECONCILER_REQUIRED"
  );

  return async function retryTransaction({
    scope,
    tran_id,
    state_fingerprint,
    beforeExternalOperation =
      async () => {}
  } = {}) {
    const branch =
      validateScope(
        scope
      );

    const tranId =
      requiredString(
        tran_id,
        "KDS_DORMANT_RETRY_TRAN_REQUIRED"
      );

    const expectedFingerprint =
      validateFingerprint(
        state_fingerprint,
        "KDS_DORMANT_RETRY_CLAIM_FINGERPRINT_INVALID"
      );

    requiredFunction(
      beforeExternalOperation,
      "KDS_DORMANT_RETRY_LEASE_GUARD_REQUIRED"
    );

    await beforeExternalOperation();

    const history =
      await loadDurableEvents({
        scope:
          branch,

        tran_id:
          tranId
      });

    if (
      !Array.isArray(history) ||
      history.length === 0
    ) {
      throw compositionError(
        "KDS_DORMANT_RETRY_HISTORY_EMPTY"
      );
    }

    const state =
      projectState(
        history
      );

    if (
      !state ||
      typeof state !==
        "object" ||
      state.tran_id !==
        tranId
    ) {
      throw compositionError(
        "KDS_DORMANT_RETRY_STATE_INVALID"
      );
    }

    const currentFingerprint =
      validateFingerprint(
        state.state_fingerprint,
        "KDS_DORMANT_RETRY_STATE_FINGERPRINT_INVALID"
      );

    /*
     * Do not reconcile a stale claimed queue snapshot against
     * a newer durable transaction state.
     *
     * The caller fails closed; branch checkpoint cannot advance.
     */
    if (
      currentFingerprint !==
      expectedFingerprint
    ) {
      throw compositionError(
        "KDS_DORMANT_RETRY_STATE_CHANGED"
      );
    }

    await beforeExternalOperation();

    const reconciliation =
      await reconcileWithC03({
        scope:
          branch,

        tran_id:
          tranId,

        state
      });

    return Object.freeze({
      status:
        classifyRetryReconciliationV1(
          reconciliation
        ),

      state_fingerprint:
        currentFingerprint
    });
  };
}

function createFabiKdsDormantRuntimeCompositionV1({
  scopeProvider,
  nowProvider,

  c04HttpClient,
  c03HttpClient,
  c03WindowProvider,

  c03EligibilityProvider,

  durableDbAdapter,
  runtimeLeaseAdapter,
  reconciliationQueueAdapter,

  c04MaxPages = 100,

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
    "KDS_DORMANT_SCOPE_PROVIDER_REQUIRED"
  );

  requiredFunction(
    nowProvider,
    "KDS_DORMANT_NOW_PROVIDER_REQUIRED"
  );

  const c03RecoveryWindowProvider =
    c03WindowProvider === undefined
      ? createFabiC03RecoveryWindowProviderV1({
          nowProvider
        })
      : requiredFunction(
          c03WindowProvider,
          "KDS_DORMANT_C03_WINDOW_PROVIDER_REQUIRED"
        );

  const historicalC03WindowProvider =
    createFabiC03HistoricalWindowProviderV1({
      windowProvider:
        c03RecoveryWindowProvider
    });

  const closedHoursEligibility =
    c03EligibilityProvider === undefined
      ? async () =>
          planFabiKdsClosedHoursV1({
            now_ms:
              await nowProvider()
          })
      : requiredFunction(
          c03EligibilityProvider,
          "KDS_DORMANT_C03_ELIGIBILITY_PROVIDER_REQUIRED"
        );

  requiredMethod(
    c04HttpClient,
    "getSaleChangeLog",
    "KDS_DORMANT_C04_HTTP_REQUIRED"
  );

  requiredMethod(
    c03HttpClient,
    "getSaleDetail",
    "KDS_DORMANT_C03_HTTP_REQUIRED"
  );

  const loadDurableEvents =
    requiredMethod(
      durableDbAdapter,
      "loadDurableEvents",
      "KDS_DORMANT_DURABLE_LOAD_REQUIRED"
    );

  requiredMethod(
    durableDbAdapter,
    "invokeRpc",
    "KDS_DORMANT_DURABLE_WRITE_REQUIRED"
  );

  requiredMethod(
    runtimeLeaseAdapter,
    "acquire",
    "KDS_DORMANT_LEASE_REQUIRED"
  );

  requiredMethod(
    runtimeLeaseAdapter,
    "renew",
    "KDS_DORMANT_LEASE_RENEW_REQUIRED"
  );

  requiredMethod(
    reconciliationQueueAdapter,
    "putResult",
    "KDS_DORMANT_QUEUE_REQUIRED"
  );

  /*
   * Real C03 reconciliation for retry.
   *
   * Scope comes from the current fenced branch attempt,
   * never from a separate potentially drifting provider.
   */
  async function reconcileRetryWithC03({
    scope,
    tran_id,
    state
  }) {
    const branch =
      validateScope(
        scope
      );

    const finalBridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient:
          c03HttpClient,

        scopeProvider:
          async () =>
            branch,

        windowProvider:
          historicalC03WindowProvider
      });

    const reconciler =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          finalBridge.fetchFinalInvoice
      });

    return reconciler.reconcile({
      tran_id,
      state
    });
  }

  const retryTransaction =
    createFabiKdsRetryTransactionV1({
      loadDurableEvents,

      projectState:
        projectFabiC04StateV1,

      reconcileWithC03:
        reconcileRetryWithC03
    });

  /*
   * Factory called by the one-shot runner only after branch
   * lease acquisition and window planning.
   *
   * Both C04 and C03 receive the exact fenced branch scope.
   */
  function createPollRuntime({
    scope,
    window,
    c03Eligibility,
    beforeExternalOperation =
      async () => {}
  } = {}) {
    const branch =
      validateScope(
        scope
      );

    if (
      !window ||
      typeof window !==
        "object"
    ) {
      throw compositionError(
        "KDS_DORMANT_WINDOW_INVALID"
      );
    }

    requiredFunction(
      beforeExternalOperation,
      "KDS_DORMANT_LEASE_GUARD_REQUIRED"
    );

    return createFabiKdsRuntimeCompositionV1({
      c04HttpClient,

      c04ScopeProvider:
        async () =>
          branch,

      c04WindowProvider:
        async () =>
          window,

      durableDbAdapter,

      c03HttpClient,

      c03ScopeProvider:
        async () =>
          branch,

      c03WindowProvider:
        historicalC03WindowProvider,

      c03Eligibility,

      beforeExternalOperation,

      c04MaxPages
    });
  }

  const runner =
    createFabiKdsOneShotRunnerV1({
      scopeProvider:
        async () =>
          validateScope(
            await scopeProvider()
          ),

      nowProvider,

      runtimeLeaseAdapter,
      reconciliationQueueAdapter,

      createPollRuntime,
      retryTransaction,

      c03EligibilityProvider:
        closedHoursEligibility,

      branchLeaseSeconds,

      overlapMs,
      settleLagMs,
      maxAdvanceMs,
      bootstrapLookbackMs,

      pendingRetryDelaySeconds,
      retryBatchSize,
      retryLeaseSeconds
    });

  return Object.freeze({
    runOnce:
      runner.runOnce,

    status:
      runner.status
  });
}

module.exports = {
  classifyRetryReconciliationV1,
  createFabiKdsRetryTransactionV1,
  createFabiKdsDormantRuntimeCompositionV1
};
