"use strict";

const {
  normalizeFabiC04EventV1
} = require(
  "./cingKdsFabiC04EventNormalizerV1"
);

const {
  projectFabiC04StateV1
} = require(
  "./cingKdsFabiC04SignedDeltaReducerV1"
);

function coordinatorError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredFunction(
  value,
  code
) {
  if (typeof value !== "function") {
    throw coordinatorError(code);
  }

  return value;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function validateFetchResult(result) {
  if (
    !isPlainObject(result) ||
    !Array.isArray(result.events)
  ) {
    throw coordinatorError(
      "C04_INGEST_FETCH_INVALID"
    );
  }

  return result;
}

function validateDurableReceipt(receipt) {
  if (
    !isPlainObject(receipt) ||
    receipt.durable !== true ||
    typeof receipt.accepted !== "boolean" ||
    typeof receipt.review_required !== "boolean"
  ) {
    throw coordinatorError(
      "C04_INGEST_PERSIST_RECEIPT_INVALID"
    );
  }

  if (
    receipt.result !== "inserted" &&
    receipt.result !== "duplicate" &&
    receipt.result !== "conflict"
  ) {
    throw coordinatorError(
      "C04_INGEST_PERSIST_RECEIPT_INVALID"
    );
  }

  return receipt;
}

function validateDurableHistory(
  events,
  tranId
) {
  if (!Array.isArray(events)) {
    throw coordinatorError(
      "C04_INGEST_DURABLE_HISTORY_INVALID"
    );
  }

  if (events.length === 0) {
    throw coordinatorError(
      "C04_INGEST_DURABLE_HISTORY_EMPTY"
    );
  }

  for (const event of events) {
    if (
      !isPlainObject(event) ||
      event.tran_id !== tranId
    ) {
      throw coordinatorError(
        "C04_INGEST_DURABLE_HISTORY_FOREIGN"
      );
    }

    if (
      event.schema_version !==
      "cing_kds_fabi_c04_event_v1"
    ) {
      throw coordinatorError(
        "C04_INGEST_DURABLE_HISTORY_SCHEMA"
      );
    }
  }

  return events;
}

function classifyReconciliation(
  result
) {
  if (!isPlainObject(result)) {
    throw coordinatorError(
      "C04_INGEST_RECONCILIATION_INVALID"
    );
  }

  if (
    result.authority !==
    "c03_paid_final"
  ) {
    throw coordinatorError(
      "C04_INGEST_RECONCILIATION_AUTHORITY_INVALID"
    );
  }

  if (result.matched === true) {
    return {
      status: "ready",
      ready: true,
      review_required: false
    };
  }

  if (
    result.matched === false &&
    result.status ===
      "not_final_yet"
  ) {
    return {
      status: "pending_c03",
      ready: false,
      review_required: false
    };
  }

  if (
    result.matched === false &&
    result.status ===
      "mismatch"
  ) {
    return {
      status: "review_required",
      ready: false,
      review_required: true
    };
  }

  throw coordinatorError(
    "C04_INGEST_RECONCILIATION_INVALID"
  );
}

function validateC03Eligibility(
  value
) {
  if (
    !isPlainObject(value) ||
    typeof value.eligible !== "boolean"
  ) {
    throw coordinatorError(
      "C04_INGEST_C03_ELIGIBILITY_INVALID"
    );
  }

  if (value.eligible === true) {
    if (
      value.retry_delay_seconds !== null &&
      value.retry_delay_seconds !== undefined
    ) {
      throw coordinatorError(
        "C04_INGEST_C03_ELIGIBILITY_INVALID"
      );
    }

    return Object.freeze({
      eligible: true,
      retry_delay_seconds: null
    });
  }

  const delay = Number(
    value.retry_delay_seconds
  );

  if (
    !Number.isSafeInteger(delay) ||
    delay < 1 ||
    delay > 32_400
  ) {
    throw coordinatorError(
      "C04_INGEST_C03_ELIGIBILITY_INVALID"
    );
  }

  return Object.freeze({
    eligible: false,
    retry_delay_seconds: delay
  });
}

function createFabiC04IngestCoordinatorV1({
  fetchEvents,
  persistenceAdapter,
  loadDurableEvents,
  reconcileWithC03,
  c03Eligibility = {
    eligible: true,
    retry_delay_seconds: null
  },
  beforeExternalOperation =
    async () => {},
  normalizeEvent =
    normalizeFabiC04EventV1,
  projectState =
    projectFabiC04StateV1
} = {}) {
  requiredFunction(
    fetchEvents,
    "C04_INGEST_FETCH_ADAPTER_REQUIRED"
  );

  requiredFunction(
    beforeExternalOperation,
    "C04_INGEST_LEASE_GUARD_REQUIRED"
  );

  if (
    !persistenceAdapter ||
    typeof persistenceAdapter.persist !==
      "function"
  ) {
    throw coordinatorError(
      "C04_INGEST_PERSIST_ADAPTER_REQUIRED"
    );
  }

  requiredFunction(
    loadDurableEvents,
    "C04_INGEST_DURABLE_LOADER_REQUIRED"
  );

  requiredFunction(
    reconcileWithC03,
    "C04_INGEST_C03_RECONCILER_REQUIRED"
  );

  requiredFunction(
    normalizeEvent,
    "C04_INGEST_NORMALIZER_REQUIRED"
  );

  requiredFunction(
    projectState,
    "C04_INGEST_PROJECTOR_REQUIRED"
  );

  const c03Plan =
    validateC03Eligibility(
      c03Eligibility
    );

  let running = false;
  let closed = false;

  async function poll({
    cursor = null
  } = {}) {
    if (closed) {
      throw coordinatorError(
        "C04_INGEST_CLOSED"
      );
    }

    if (running) {
      throw coordinatorError(
        "C04_INGEST_ALREADY_RUNNING"
      );
    }

    running = true;

    try {
      const fetched =
        validateFetchResult(
          await fetchEvents({
            cursor
          })
        );

      if (
        fetched.events.length === 0
      ) {
        return Object.freeze({
          fetched_event_count: 0,
          durable_event_count: 0,
          transactions: [],
          next_cursor:
            fetched.next_cursor ??
            cursor
        });
      }

      const normalizedEvents = [];

      for (
        const rawEvent
        of fetched.events
      ) {
        normalizedEvents.push(
          normalizeEvent(
            rawEvent
          )
        );
      }

      const blockedTransactions =
        new Map();

      const durableAccepted =
        [];

      /*
       * Deliberately persist sequentially.
       *
       * A crash after any successful durable write
       * is safe because retry returns duplicate.
       * Nothing below this loop can run before each
       * event has a durable receipt.
       */
      for (
        const event
        of normalizedEvents
      ) {
        await beforeExternalOperation();

        const receipt =
          validateDurableReceipt(
            await persistenceAdapter
              .persist(event)
          );

        if (
          receipt.accepted !== true
        ) {
          blockedTransactions.set(
            event.tran_id,
            {
              tran_id:
                event.tran_id,

              status:
                "review_required",

              ready:
                false,

              review_required:
                true,

              reason:
                "durable_event_conflict"
            }
          );

          continue;
        }

        durableAccepted.push(
          event
        );
      }

      const transactionIds =
        [
          ...new Set(
            normalizedEvents.map(
              event =>
                event.tran_id
            )
          )
        ].sort();

      const transactions = [];

      for (
        const tranId
        of transactionIds
      ) {
        if (
          blockedTransactions.has(
            tranId
          )
        ) {
          transactions.push(
            blockedTransactions.get(
              tranId
            )
          );

          continue;
        }

        /*
         * Critical boundary:
         * reducer consumes DURABLE reload,
         * never the transient fetch batch.
         */
        await beforeExternalOperation();

        const durableHistory =
          validateDurableHistory(
            await loadDurableEvents({
              tran_id:
                tranId
            }),
            tranId
          );

        const state =
          projectState(
            durableHistory
          );

        if (
          !state ||
          state.tran_id !== tranId
        ) {
          throw coordinatorError(
            "C04_INGEST_PROJECTED_STATE_INVALID"
          );
        }

        if (c03Plan.eligible !== true) {
          transactions.push(
            Object.freeze({
              tran_id:
                tranId,

              status:
                "pending_c03",

              ready:
                false,

              review_required:
                false,

              state_fingerprint:
                state.state_fingerprint,

              active_line_count:
                state.active_line_count,

              total_quantity:
                state.total_quantity,

              reconciliation_authority:
                "deferred_closed_hours",

              retry_delay_seconds:
                c03Plan
                  .retry_delay_seconds
            })
          );

          continue;
        }

        await beforeExternalOperation();

        const reconciliation =
          await reconcileWithC03({
            tran_id:
              tranId,

            state
          });

        const classification =
          classifyReconciliation(
            reconciliation
          );

        transactions.push(
          Object.freeze({
            tran_id:
              tranId,

            status:
              classification.status,

            ready:
              classification.ready,

            review_required:
              classification
                .review_required,

            state_fingerprint:
              state.state_fingerprint,

            active_line_count:
              state.active_line_count,

            total_quantity:
              state.total_quantity,

            reconciliation_authority:
              "c03_paid_final"
          })
        );
      }

      return Object.freeze({
        fetched_event_count:
          fetched.events.length,

        durable_event_count:
          durableAccepted.length,

        transactions:
          Object.freeze(
            transactions
          ),

        next_cursor:
          fetched.next_cursor ??
          cursor
      });
    } finally {
      running = false;
    }
  }

  function status() {
    return Object.freeze({
      running,
      closed
    });
  }

  function close() {
    closed = true;
  }

  return Object.freeze({
    poll,
    status,
    close
  });
}

module.exports = {
  createFabiC04IngestCoordinatorV1
};
