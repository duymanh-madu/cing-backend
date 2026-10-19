"use strict";

/*
 * Cing KDS FABi Runtime Composition V1
 *
 * DORMANT composition root only.
 *
 * This module:
 * - performs no live I/O during construction
 * - reads no environment variables
 * - owns no scheduler
 * - mounts no HTTP/socket routes
 * - grants no payment/final authority
 *
 * Runtime activation belongs to a later fenced worker phase.
 */

const {
  createFabiC04FetchAdapterV1
} = require(
  "./cingKdsFabiC04FetchAdapterV1"
);

const {
  createFabiC04InboxPersistenceAdapterV1
} = require(
  "./cingKdsFabiC04InboxPersistenceAdapterV1"
);

const {
  createFabiC04IngestCoordinatorV1
} = require(
  "./cingKdsFabiC04IngestCoordinatorV1"
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

function validateHttpClient(
  client,
  method,
  code
) {
  if (
    !client ||
    typeof client !==
      "object" ||
    typeof client[method] !==
      "function"
  ) {
    throw compositionError(
      code
    );
  }

  return client;
}

function validateDurableDbAdapter(
  adapter
) {
  if (
    !adapter ||
    typeof adapter !==
      "object"
  ) {
    throw compositionError(
      "KDS_RUNTIME_DURABLE_DB_ADAPTER_REQUIRED"
    );
  }

  requiredFunction(
    adapter.invokeRpc,
    "KDS_RUNTIME_DURABLE_WRITE_REQUIRED"
  );

  requiredFunction(
    adapter.loadDurableEvents,
    "KDS_RUNTIME_DURABLE_READ_REQUIRED"
  );

  return adapter;
}

function createFabiKdsRuntimeCompositionV1({
  c04HttpClient,
  c04ScopeProvider,
  c04WindowProvider,

  durableDbAdapter,

  c03HttpClient,
  c03ScopeProvider,
  c03WindowProvider,

  c03Eligibility = {
    eligible: true,
    retry_delay_seconds: null
  },

  beforeExternalOperation =
    async () => {},

  c04MaxPages = 100
} = {}) {
  const c04Http =
    validateHttpClient(
      c04HttpClient,
      "getSaleChangeLog",
      "KDS_RUNTIME_C04_HTTP_REQUIRED"
    );

  requiredFunction(
    c04ScopeProvider,
    "KDS_RUNTIME_C04_SCOPE_PROVIDER_REQUIRED"
  );

  requiredFunction(
    c04WindowProvider,
    "KDS_RUNTIME_C04_WINDOW_PROVIDER_REQUIRED"
  );

  const durable =
    validateDurableDbAdapter(
      durableDbAdapter
    );

  const c03Http =
    validateHttpClient(
      c03HttpClient,
      "getSaleDetail",
      "KDS_RUNTIME_C03_HTTP_REQUIRED"
    );

  requiredFunction(
    c03ScopeProvider,
    "KDS_RUNTIME_C03_SCOPE_PROVIDER_REQUIRED"
  );

  requiredFunction(
    c03WindowProvider,
    "KDS_RUNTIME_C03_WINDOW_PROVIDER_REQUIRED"
  );

  requiredFunction(
    beforeExternalOperation,
    "KDS_RUNTIME_LEASE_GUARD_REQUIRED"
  );

  /*
   * C04 upstream read.
   */
  const fetchAdapter =
    createFabiC04FetchAdapterV1({
      httpClient:
        c04Http,

      scopeProvider:
        c04ScopeProvider,

      windowProvider:
        c04WindowProvider,

      beforeExternalOperation,

      maxPages:
        c04MaxPages
    });

  /*
   * Durable normalized C04 writer.
   *
   * Exact RPC execution remains constrained by
   * cingKdsFabiC04DurableDbAdapterV1.
   */
  const persistenceAdapter =
    createFabiC04InboxPersistenceAdapterV1({
      invokeRpc:
        durable.invokeRpc
    });

  /*
   * C03 paid-final report fetch bridge.
   */
  const finalFetchBridge =
    createFabiC03FinalFetchBridgeV1({
      httpClient:
        c03Http,

      scopeProvider:
        c03ScopeProvider,

      windowProvider:
        c03WindowProvider
    });

  if (
    !finalFetchBridge ||
    typeof finalFetchBridge
      .fetchFinalInvoice !==
      "function"
  ) {
    throw compositionError(
      "KDS_RUNTIME_C03_FINAL_FETCH_INVALID"
    );
  }

  /*
   * C03 reconciliation remains the only gate that can
   * classify the C04 projected state as paid-final ready.
   */
  const reconciliationAdapter =
    createFabiC03FinalReconciliationAdapterV1({
      fetchFinalInvoice:
        finalFetchBridge
          .fetchFinalInvoice
    });

  if (
    !reconciliationAdapter ||
    typeof reconciliationAdapter
      .reconcile !==
      "function"
  ) {
    throw compositionError(
      "KDS_RUNTIME_C03_RECONCILER_INVALID"
    );
  }

  /*
   * Core coordinator:
   *
   * fetch
   * -> normalize
   * -> durable persist
   * -> durable reload
   * -> signed-delta reduce
   * -> C03 reconciliation
   */
  const coordinator =
    createFabiC04IngestCoordinatorV1({
      fetchEvents:
        fetchAdapter.fetchEvents,

      persistenceAdapter,

      loadDurableEvents:
        async ({
          tran_id
        }) =>
          durable.loadDurableEvents({
            scope:
              await c04ScopeProvider(),

            tran_id
          }),

      reconcileWithC03:
        reconciliationAdapter
          .reconcile,

      c03Eligibility,

      beforeExternalOperation
    });

  return Object.freeze({
    poll:
      coordinator.poll,

    status:
      coordinator.status,

    close:
      coordinator.close
  });
}

module.exports = {
  createFabiKdsRuntimeCompositionV1
};
