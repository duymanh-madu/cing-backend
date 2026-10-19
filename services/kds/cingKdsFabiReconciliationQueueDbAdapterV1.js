"use strict";

const PUT_RPC =
  "cing_kds_fabi_reconciliation_result_put_v1";

const CLAIM_RPC =
  "cing_kds_fabi_reconciliation_claim_due_v1";

const RESOLVE_RPC =
  "cing_kds_fabi_reconciliation_resolve_claim_v1";

const STATUS_SET =
  new Set([
    "pending_c03",
    "ready",
    "review_required"
  ]);

function adapterError(
  code
) {
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
    throw adapterError(code);
  }

  return number;
}

function validateScope(
  scope
) {
  if (
    !scope ||
    typeof scope !== "object"
  ) {
    throw adapterError(
      "KDS_RECON_SCOPE_INVALID"
    );
  }

  return Object.freeze({
    company_uid:
      requiredString(
        scope.company_uid,
        "KDS_RECON_COMPANY_REQUIRED"
      ),

    brand_uid:
      requiredString(
        scope.brand_uid,
        "KDS_RECON_BRAND_REQUIRED"
      ),

    store_uid:
      requiredString(
        scope.store_uid,
        "KDS_RECON_STORE_REQUIRED"
      )
  });
}

function validateStatus(
  value
) {
  if (
    typeof value !== "string" ||
    !STATUS_SET.has(value)
  ) {
    throw adapterError(
      "KDS_RECON_STATUS_INVALID"
    );
  }

  return value;
}

function validateFingerprint(
  value
) {
  const fingerprint =
    requiredString(
      value,
      "KDS_RECON_FINGERPRINT_REQUIRED"
    );

  if (
    !/^[a-f0-9]{64}$/.test(
      fingerprint
    )
  ) {
    throw adapterError(
      "KDS_RECON_FINGERPRINT_INVALID"
    );
  }

  return fingerprint;
}

function retryDelay(
  status,
  value
) {
  if (
    status !== "pending_c03"
  ) {
    if (
      value !== null &&
      value !== undefined
    ) {
      throw adapterError(
        "KDS_RECON_TERMINAL_RETRY_FORBIDDEN"
      );
    }

    return null;
  }

  const delay =
    positiveInteger(
      value,
      "KDS_RECON_RETRY_DELAY_INVALID"
    );

  if (delay > 32_400) {
    throw adapterError(
      "KDS_RECON_RETRY_DELAY_INVALID"
    );
  }

  return delay;
}

function oneRow(
  data,
  code
) {
  if (
    !Array.isArray(data) ||
    data.length !== 1 ||
    !data[0] ||
    typeof data[0] !== "object"
  ) {
    throw adapterError(code);
  }

  return data[0];
}

function normalizedResult(
  row
) {
  const status =
    validateStatus(
      row.reconciliation_status
    );

  const version =
    positiveInteger(
      row.result_version,
      "KDS_RECON_RESULT_VERSION_INVALID"
    );

  const attempts =
    Number(
      row.attempt_count
    );

  if (
    !Number.isSafeInteger(attempts) ||
    attempts < 0
  ) {
    throw adapterError(
      "KDS_RECON_ATTEMPT_COUNT_INVALID"
    );
  }

  return Object.freeze({
    status,
    result_version:
      version,
    attempt_count:
      attempts,
    next_reconcile_at:
      row.next_reconcile_at ??
      null
  });
}

function createFabiKdsReconciliationQueueDbAdapterV1({
  supabase
} = {}) {
  if (
    !supabase ||
    typeof supabase.rpc !== "function"
  ) {
    throw adapterError(
      "KDS_RECON_RPC_CLIENT_REQUIRED"
    );
  }

  async function rpc(
    name,
    args,
    failureCode
  ) {
    let result;

    try {
      result =
        await supabase.rpc(
          name,
          args
        );
    } catch (_) {
      throw adapterError(
        failureCode
      );
    }

    if (
      !result ||
      result.error
    ) {
      throw adapterError(
        failureCode
      );
    }

    return result.data;
  }

  async function putResult({
    scope,
    tran_id,
    status,
    state_fingerprint,
    retry_delay_seconds = null
  } = {}) {
    const branch =
      validateScope(scope);

    const tranId =
      requiredString(
        tran_id,
        "KDS_RECON_TRAN_ID_REQUIRED"
      );

    const normalizedStatus =
      validateStatus(status);

    const fingerprint =
      validateFingerprint(
        state_fingerprint
      );

    const delay =
      retryDelay(
        normalizedStatus,
        retry_delay_seconds
      );

    const row =
      oneRow(
        await rpc(
          PUT_RPC,
          {
            p_company_uid:
              branch.company_uid,

            p_brand_uid:
              branch.brand_uid,

            p_store_uid:
              branch.store_uid,

            p_tran_id:
              tranId,

            p_status:
              normalizedStatus,

            p_state_fingerprint:
              fingerprint,

            p_retry_delay_seconds:
              delay
          },
          "KDS_RECON_RESULT_PUT_FAILED"
        ),
        "KDS_RECON_RESULT_PUT_RESULT_INVALID"
      );

    return normalizedResult(
      row
    );
  }

  async function claimDue({
    scope,
    batch_size,
    lease_seconds
  } = {}) {
    const branch =
      validateScope(scope);

    const batchSize =
      positiveInteger(
        batch_size,
        "KDS_RECON_BATCH_SIZE_INVALID"
      );

    const leaseSeconds =
      positiveInteger(
        lease_seconds,
        "KDS_RECON_LEASE_SECONDS_INVALID"
      );

    if (
      batchSize > 100 ||
      leaseSeconds < 30 ||
      leaseSeconds > 900
    ) {
      throw adapterError(
        batchSize > 100
          ? "KDS_RECON_BATCH_SIZE_INVALID"
          : "KDS_RECON_LEASE_SECONDS_INVALID"
      );
    }

    const data =
      await rpc(
        CLAIM_RPC,
        {
          p_company_uid:
            branch.company_uid,

          p_brand_uid:
            branch.brand_uid,

          p_store_uid:
            branch.store_uid,

          p_batch_size:
            batchSize,

          p_lease_seconds:
            leaseSeconds
        },
        "KDS_RECON_CLAIM_FAILED"
      );

    if (!Array.isArray(data)) {
      throw adapterError(
        "KDS_RECON_CLAIM_RESULT_INVALID"
      );
    }

    return Object.freeze(
      data.map(row => {
        if (
          !row ||
          typeof row !== "object"
        ) {
          throw adapterError(
            "KDS_RECON_CLAIM_RESULT_INVALID"
          );
        }

        return Object.freeze({
          tran_id:
            requiredString(
              row.tran_id,
              "KDS_RECON_CLAIM_TRAN_INVALID"
            ),

          claim_token:
            requiredString(
              row.claim_token,
              "KDS_RECON_CLAIM_TOKEN_INVALID"
            ),

          result_version:
            positiveInteger(
              row.result_version,
              "KDS_RECON_RESULT_VERSION_INVALID"
            ),

          state_fingerprint:
            validateFingerprint(
              row.state_fingerprint
            ),

          attempt_count:
            positiveInteger(
              row.attempt_count,
              "KDS_RECON_ATTEMPT_COUNT_INVALID"
            )
        });
      })
    );
  }

  async function resolveClaim({
    scope,
    tran_id,
    claim_token,
    expected_result_version,
    status,
    state_fingerprint,
    retry_delay_seconds = null
  } = {}) {
    const branch =
      validateScope(scope);

    const tranId =
      requiredString(
        tran_id,
        "KDS_RECON_TRAN_ID_REQUIRED"
      );

    const token =
      requiredString(
        claim_token,
        "KDS_RECON_CLAIM_TOKEN_REQUIRED"
      );

    const version =
      positiveInteger(
        expected_result_version,
        "KDS_RECON_RESULT_VERSION_INVALID"
      );

    const normalizedStatus =
      validateStatus(status);

    const fingerprint =
      validateFingerprint(
        state_fingerprint
      );

    const delay =
      retryDelay(
        normalizedStatus,
        retry_delay_seconds
      );

    const row =
      oneRow(
        await rpc(
          RESOLVE_RPC,
          {
            p_company_uid:
              branch.company_uid,

            p_brand_uid:
              branch.brand_uid,

            p_store_uid:
              branch.store_uid,

            p_tran_id:
              tranId,

            p_claim_token:
              token,

            p_expected_result_version:
              version,

            p_status:
              normalizedStatus,

            p_state_fingerprint:
              fingerprint,

            p_retry_delay_seconds:
              delay
          },
          "KDS_RECON_RESOLVE_FAILED"
        ),
        "KDS_RECON_RESOLVE_RESULT_INVALID"
      );

    return normalizedResult(
      row
    );
  }

  return Object.freeze({
    putResult,
    claimDue,
    resolveClaim
  });
}

module.exports = {
  PUT_RPC,
  CLAIM_RPC,
  RESOLVE_RPC,
  createFabiKdsReconciliationQueueDbAdapterV1
};
