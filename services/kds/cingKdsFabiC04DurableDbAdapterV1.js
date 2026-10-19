"use strict";

const PUT_RPC =
  "cing_kds_fabi_c04_event_inbox_put_v1";

const LOAD_RPC =
  "cing_kds_fabi_c04_event_inbox_load_tran_v1";

function adapterError(code) {
  const error =
    new Error(code);

  error.code =
    code;

  return error;
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

function validateRpcClient(
  supabase
) {
  if (
    !supabase ||
    typeof supabase.rpc !==
      "function"
  ) {
    throw adapterError(
      "C04_DB_RPC_CLIENT_REQUIRED"
    );
  }
}

function normalizePutRows(data) {
  if (
    !Array.isArray(data) ||
    data.length !== 1
  ) {
    throw adapterError(
      "C04_DB_PUT_RESULT_INVALID"
    );
  }

  const row =
    data[0];

  if (
    !row ||
    typeof row !== "object"
  ) {
    throw adapterError(
      "C04_DB_PUT_RESULT_INVALID"
    );
  }

  return row;
}

function validateScope(
  scope
) {
  if (
    !scope ||
    typeof scope !== "object"
  ) {
    throw adapterError(
      "C04_DB_LOAD_SCOPE_REQUIRED"
    );
  }

  return Object.freeze({
    company_uid:
      requiredString(
        scope.company_uid,
        "C04_DB_LOAD_COMPANY_REQUIRED"
      ),

    brand_uid:
      requiredString(
        scope.brand_uid,
        "C04_DB_LOAD_BRAND_REQUIRED"
      ),

    store_uid:
      requiredString(
        scope.store_uid,
        "C04_DB_LOAD_STORE_REQUIRED"
      )
  });
}

function validateNormalizedEvent(
  value,
  expectedTranId
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw adapterError(
      "C04_DB_DURABLE_EVENT_INVALID"
    );
  }

  if (
    value.schema_version !==
      "cing_kds_fabi_c04_event_v1"
  ) {
    throw adapterError(
      "C04_DB_DURABLE_EVENT_SCHEMA_INVALID"
    );
  }

  if (
    value.tran_id !==
      expectedTranId
  ) {
    throw adapterError(
      "C04_DB_DURABLE_EVENT_TRAN_MISMATCH"
    );
  }

  if (
    !value.semantics ||
    value.semantics
      .quantity_model !==
      "signed_delta" ||
    value.semantics
      .payment_authority !==
      false ||
    value.semantics
      .final_state_authority !==
      false
  ) {
    throw adapterError(
      "C04_DB_DURABLE_EVENT_AUTHORITY_INVALID"
    );
  }

  return value;
}

function createFabiC04DurableDbAdapterV1({
  supabase
} = {}) {
  validateRpcClient(
    supabase
  );

  async function invokeRpc({
    functionName,
    args
  } = {}) {
    const name =
      requiredString(
        functionName,
        "C04_DB_FUNCTION_NAME_REQUIRED"
      );

    if (
      name !== PUT_RPC
    ) {
      throw adapterError(
        "C04_DB_WRITE_RPC_FORBIDDEN"
      );
    }

    if (
      !args ||
      typeof args !== "object" ||
      Array.isArray(args)
    ) {
      throw adapterError(
        "C04_DB_WRITE_ARGS_INVALID"
      );
    }

    const {
      data,
      error
    } =
      await supabase.rpc(
        PUT_RPC,
        args
      );

    if (error) {
      throw adapterError(
        "C04_DB_WRITE_FAILED"
      );
    }

    return normalizePutRows(
      data
    );
  }

  async function loadDurableEvents({
    scope,
    tran_id
  } = {}) {
    const branch =
      validateScope(
        scope
      );

    const tranId =
      requiredString(
        tran_id,
        "C04_DB_LOAD_TRAN_ID_REQUIRED"
      );

    const {
      data,
      error
    } =
      await supabase.rpc(
        LOAD_RPC,
        {
          p_company_uid:
            branch.company_uid,

          p_brand_uid:
            branch.brand_uid,

          p_store_uid:
            branch.store_uid,

          p_tran_id:
            tranId
        }
      );

    if (error) {
      throw adapterError(
        "C04_DB_LOAD_FAILED"
      );
    }

    if (
      !Array.isArray(data)
    ) {
      throw adapterError(
        "C04_DB_LOAD_RESULT_INVALID"
      );
    }

    let previousCreatedAt =
      null;

    let previousInboxId =
      null;

    return Object.freeze(
      data.map(
        (
          row,
          index
        ) => {
          if (
            !row ||
            typeof row !== "object"
          ) {
            throw adapterError(
              "C04_DB_LOAD_ROW_INVALID"
            );
          }

          const inboxId =
            Number(
              row.inbox_id
            );

          const createdAt =
            Number(
              row.event_created_at
            );

          if (
            !Number.isSafeInteger(
              inboxId
            ) ||
            inboxId <= 0 ||
            !Number.isFinite(
              createdAt
            )
          ) {
            throw adapterError(
              "C04_DB_LOAD_ROW_INVALID"
            );
          }

          /*
           * The SQL RPC already orders by
           * event_created_at, id.
           *
           * Re-check it here so a changed DB contract
           * can never silently feed unstable history
           * into the reducer.
           */
          if (
            index > 0 &&
            (
              createdAt <
                previousCreatedAt ||
              (
                createdAt ===
                  previousCreatedAt &&
                inboxId <=
                  previousInboxId
              )
            )
          ) {
            throw adapterError(
              "C04_DB_LOAD_ORDER_INVALID"
            );
          }

          previousCreatedAt =
            createdAt;

          previousInboxId =
            inboxId;

          const event =
            validateNormalizedEvent(
              row.normalized_event,
              tranId
            );

          if (
            event.source_company_uid !==
              branch.company_uid ||
            event.source_brand_uid !==
              branch.brand_uid ||
            event.source_store_uid !==
              branch.store_uid
          ) {
            throw adapterError(
              "C04_DB_DURABLE_EVENT_SCOPE_MISMATCH"
            );
          }

          return event;
        }
      )
    );
  }

  return Object.freeze({
    invokeRpc,
    loadDurableEvents
  });
}

module.exports = {
  PUT_RPC,
  LOAD_RPC,
  createFabiC04DurableDbAdapterV1
};
