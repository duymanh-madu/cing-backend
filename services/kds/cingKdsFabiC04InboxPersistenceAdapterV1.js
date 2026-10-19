"use strict";

const RPC_NAME =
  "cing_kds_fabi_c04_event_inbox_put_v1";

const EVENT_SCHEMA =
  "cing_kds_fabi_c04_event_v1";

const EVENT_SOURCE =
  "fabi_c04_sale_change_log";

const LOG_TYPE =
  "SALE_CHANGE";

const LOG_TYPES =
  Object.freeze([
    "SALE_CHANGE",
    "SALE_MERGE_ORDER"
  ]);

const ALLOWED_TOP_LEVEL_KEYS =
  new Set([
    "schema_version",
    "source",
    "source_log_type",
    "tran_id",
    "tran_no",
    "source_store_uid",
    "source_brand_uid",
    "source_company_uid",
    "event_created_at",
    "event_updated_at",
    "event_time_iso",
    "lines",
    "semantics",
    "event_fingerprint"
  ]);

function adapterError(code) {
  const error =
    new Error(code);

  error.code =
    code;

  return error;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function requiredString(
  value,
  code
) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw adapterError(code);
  }

  return value.trim();
}

function optionalString(
  value,
  code
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (typeof value !== "string") {
    throw adapterError(code);
  }

  const out =
    value.trim();

  return out || null;
}

function finiteRequired(
  value,
  code
) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    throw adapterError(code);
  }

  return number;
}

function finiteOptional(
  value,
  code
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    throw adapterError(code);
  }

  return number;
}

function validateEvent(event) {
  if (!isPlainObject(event)) {
    throw adapterError(
      "C04_PERSIST_EVENT_INVALID"
    );
  }

  for (
    const key
    of Object.keys(event)
  ) {
    if (
      !ALLOWED_TOP_LEVEL_KEYS.has(key)
    ) {
      throw adapterError(
        "C04_PERSIST_EVENT_UNEXPECTED_FIELD"
      );
    }
  }

  if (
    event.schema_version !==
    EVENT_SCHEMA
  ) {
    throw adapterError(
      "C04_PERSIST_SCHEMA_INVALID"
    );
  }

  if (
    event.source !==
    EVENT_SOURCE
  ) {
    throw adapterError(
      "C04_PERSIST_SOURCE_INVALID"
    );
  }

  if (
    !LOG_TYPES.includes(
      event.source_log_type
    )
  ) {
    throw adapterError(
      "C04_PERSIST_LOG_TYPE_INVALID"
    );
  }

  if (
    typeof event.event_fingerprint !==
      "string" ||
    !/^[a-f0-9]{64}$/.test(
      event.event_fingerprint
    )
  ) {
    throw adapterError(
      "C04_PERSIST_FINGERPRINT_INVALID"
    );
  }

  requiredString(
    event.tran_id,
    "C04_PERSIST_TRAN_ID_INVALID"
  );

  finiteRequired(
    event.event_created_at,
    "C04_PERSIST_EVENT_TIME_INVALID"
  );

  if (
    !Array.isArray(event.lines) ||
    event.lines.length === 0
  ) {
    throw adapterError(
      "C04_PERSIST_LINES_INVALID"
    );
  }

  if (
    !isPlainObject(
      event.semantics
    )
  ) {
    throw adapterError(
      "C04_PERSIST_SEMANTICS_INVALID"
    );
  }

  if (
    event.semantics
      .quantity_model !==
    "signed_delta"
  ) {
    throw adapterError(
      "C04_PERSIST_SIGNED_DELTA_REQUIRED"
    );
  }

  if (
    event.semantics
      .payment_authority !==
    false
  ) {
    throw adapterError(
      "C04_PERSIST_PAYMENT_AUTHORITY_FORBIDDEN"
    );
  }

  if (
    event.semantics
      .final_state_authority !==
    false
  ) {
    throw adapterError(
      "C04_PERSIST_FINAL_AUTHORITY_FORBIDDEN"
    );
  }
}

function buildRpcArgs(event) {
  validateEvent(event);

  return {
    p_source:
      EVENT_SOURCE,

    p_schema_version:
      EVENT_SCHEMA,

    p_source_log_type:
      event.source_log_type,

    p_event_fingerprint:
      event.event_fingerprint,

    p_tran_id:
      requiredString(
        event.tran_id,
        "C04_PERSIST_TRAN_ID_INVALID"
      ),

    p_tran_no:
      optionalString(
        event.tran_no,
        "C04_PERSIST_TRAN_NO_INVALID"
      ),

    p_source_store_uid:
      requiredString(
        event.source_store_uid,
        "C04_PERSIST_STORE_INVALID"
      ),

    p_source_brand_uid:
      requiredString(
        event.source_brand_uid,
        "C04_PERSIST_BRAND_INVALID"
      ),

    p_source_company_uid:
      requiredString(
        event.source_company_uid,
        "C04_PERSIST_COMPANY_INVALID"
      ),

    p_event_created_at:
      finiteRequired(
        event.event_created_at,
        "C04_PERSIST_EVENT_TIME_INVALID"
      ),

    p_event_updated_at:
      finiteOptional(
        event.event_updated_at,
        "C04_PERSIST_UPDATED_TIME_INVALID"
      ),

    p_normalized_event:
      event
  };
}

function positiveIntegerLike(
  value,
  code
) {
  if (
    typeof value === "number"
  ) {
    if (
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      throw adapterError(code);
    }

    return value;
  }

  if (
    typeof value === "string" &&
    /^[1-9][0-9]*$/.test(value)
  ) {
    return value;
  }

  throw adapterError(code);
}

function normalizeReceipt(receipt) {
  if (!isPlainObject(receipt)) {
    throw adapterError(
      "C04_PERSIST_RECEIPT_INVALID"
    );
  }

  const result =
    receipt.result;

  if (
    result !== "inserted" &&
    result !== "duplicate" &&
    result !== "conflict"
  ) {
    throw adapterError(
      "C04_PERSIST_RECEIPT_RESULT_INVALID"
    );
  }

  const inboxId =
    positiveIntegerLike(
      receipt.inbox_id,
      "C04_PERSIST_RECEIPT_ID_INVALID"
    );

  const observationCount =
    positiveIntegerLike(
      receipt.observation_count,
      "C04_PERSIST_RECEIPT_COUNT_INVALID"
    );

  if (result === "conflict") {
    return Object.freeze({
      durable:
        true,

      accepted:
        false,

      review_required:
        true,

      result:
        "conflict",

      inbox_id:
        inboxId,

      observation_count:
        observationCount
    });
  }

  return Object.freeze({
    durable:
      true,

    accepted:
      true,

    review_required:
      false,

    result,

    inbox_id:
      inboxId,

    observation_count:
      observationCount
  });
}

function createFabiC04InboxPersistenceAdapterV1({
  invokeRpc
} = {}) {
  if (typeof invokeRpc !== "function") {
    throw adapterError(
      "C04_PERSIST_RPC_ADAPTER_REQUIRED"
    );
  }

  async function persist(
    normalizedEvent
  ) {
    const args =
      buildRpcArgs(
        normalizedEvent
      );

    let receipt;

    try {
      receipt =
        await invokeRpc({
          functionName:
            RPC_NAME,

          args
        });
    } catch (_) {
      /*
       * Deliberately do not expose the underlying
       * transport/database error message.
       *
       * The database may already have committed.
       * Therefore the caller MUST NOT ACK success.
       * Retrying the identical event is safe because
       * persistent fingerprint idempotency classifies
       * it as duplicate.
       */
      throw adapterError(
        "C04_PERSIST_OUTCOME_UNKNOWN"
      );
    }

    return normalizeReceipt(
      receipt
    );
  }

  return Object.freeze({
    persist
  });
}

module.exports = {
  RPC_NAME,
  EVENT_SCHEMA,
  EVENT_SOURCE,
  LOG_TYPE,
  LOG_TYPES,
  buildRpcArgs,
  createFabiC04InboxPersistenceAdapterV1
};
