"use strict";

const ACQUIRE_RPC =
  "cing_kds_fabi_runtime_lease_acquire_v1";

const COMMIT_RPC =
  "cing_kds_fabi_runtime_checkpoint_commit_v1";

const RENEW_RPC =
  "cing_kds_fabi_runtime_lease_renew_v1";

const RELEASE_RPC =
  "cing_kds_fabi_runtime_lease_release_v1";

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

function validateClient(
  supabase
) {
  if (
    !supabase ||
    typeof supabase.rpc !==
      "function"
  ) {
    throw adapterError(
      "KDS_RUNTIME_RPC_CLIENT_REQUIRED"
    );
  }
}

function validateScope(
  scope
) {
  if (
    !scope ||
    typeof scope !== "object"
  ) {
    throw adapterError(
      "KDS_RUNTIME_SCOPE_INVALID"
    );
  }

  return Object.freeze({
    company_uid:
      requiredString(
        scope.company_uid,
        "KDS_RUNTIME_COMPANY_REQUIRED"
      ),

    brand_uid:
      requiredString(
        scope.brand_uid,
        "KDS_RUNTIME_BRAND_REQUIRED"
      ),

    store_uid:
      requiredString(
        scope.store_uid,
        "KDS_RUNTIME_STORE_REQUIRED"
      )
  });
}

function oneRow(
  data,
  code
) {
  if (
    !Array.isArray(data) ||
    data.length !== 1 ||
    !data[0] ||
    typeof data[0] !==
      "object"
  ) {
    throw adapterError(code);
  }

  return data[0];
}

function safeCheckpoint(
  value,
  code
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const number =
    Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 0
  ) {
    throw adapterError(code);
  }

  return number;
}

function validateLeaseSeconds(
  value
) {
  const seconds =
    Number(value);

  if (
    !Number.isSafeInteger(seconds) ||
    seconds !== 120
  ) {
    throw adapterError(
      "KDS_RUNTIME_EXACT_LEASE_SECONDS_REQUIRED"
    );
  }

  return seconds;
}

function createFabiKdsRuntimeLeaseDbAdapterV1({
  supabase
} = {}) {
  validateClient(
    supabase
  );

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

  async function acquire({
    scope,
    lease_seconds
  } = {}) {
    const normalizedScope =
      validateScope(
        scope
      );

    const leaseSeconds =
      validateLeaseSeconds(
        lease_seconds
      );

    const row =
      oneRow(
        await rpc(
          ACQUIRE_RPC,
          {
            p_company_uid:
              normalizedScope
                .company_uid,

            p_brand_uid:
              normalizedScope
                .brand_uid,

            p_store_uid:
              normalizedScope
                .store_uid,

            p_lease_seconds:
              leaseSeconds
          },
          "KDS_RUNTIME_LEASE_ACQUIRE_FAILED"
        ),
        "KDS_RUNTIME_LEASE_ACQUIRE_RESULT_INVALID"
      );

    if (
      typeof row.acquired !==
        "boolean"
    ) {
      throw adapterError(
        "KDS_RUNTIME_LEASE_ACQUIRE_RESULT_INVALID"
      );
    }

    const checkpoint =
      safeCheckpoint(
        row.checkpoint_end_ms,
        "KDS_RUNTIME_CHECKPOINT_RESULT_INVALID"
      );

    if (
      row.acquired === true
    ) {
      requiredString(
        row.lease_token,
        "KDS_RUNTIME_LEASE_TOKEN_INVALID"
      );

      requiredString(
        row.lease_expires_at,
        "KDS_RUNTIME_LEASE_EXPIRY_INVALID"
      );
    }

    if (
      row.acquired === false &&
      row.lease_token !== null
    ) {
      throw adapterError(
        "KDS_RUNTIME_FOREIGN_LEASE_TOKEN_EXPOSED"
      );
    }

    return Object.freeze({
      acquired:
        row.acquired,

      lease_token:
        row.acquired
          ? row.lease_token
          : null,

      lease_expires_at:
        row.lease_expires_at ??
        null,

      checkpoint_end_ms:
        checkpoint
    });
  }

  async function renew({
    scope,
    lease_token,
    lease_seconds
  } = {}) {
    const normalizedScope =
      validateScope(
        scope
      );

    const token =
      requiredString(
        lease_token,
        "KDS_RUNTIME_LEASE_TOKEN_REQUIRED"
      );

    const seconds =
      validateLeaseSeconds(
        lease_seconds
      );

    const row =
      oneRow(
        await rpc(
          RENEW_RPC,
          {
            p_company_uid:
              normalizedScope
                .company_uid,

            p_brand_uid:
              normalizedScope
                .brand_uid,

            p_store_uid:
              normalizedScope
                .store_uid,

            p_lease_token:
              token,

            p_lease_seconds:
              seconds
          },
          "KDS_RUNTIME_LEASE_RENEW_FAILED"
        ),
        "KDS_RUNTIME_LEASE_RENEW_RESULT_INVALID"
      );

    if (
      typeof row.renewed !==
        "boolean"
    ) {
      throw adapterError(
        "KDS_RUNTIME_LEASE_RENEW_RESULT_INVALID"
      );
    }

    if (
      row.renewed === true
    ) {
      requiredString(
        row.lease_expires_at,
        "KDS_RUNTIME_LEASE_EXPIRY_INVALID"
      );
    }

    return Object.freeze({
      renewed:
        row.renewed,

      lease_expires_at:
        row.renewed
          ? row.lease_expires_at
          : null
    });
  }

  async function commit({
    scope,
    lease_token,
    checkpoint_end_ms
  } = {}) {
    const normalizedScope =
      validateScope(
        scope
      );

    const token =
      requiredString(
        lease_token,
        "KDS_RUNTIME_LEASE_TOKEN_REQUIRED"
      );

    const checkpoint =
      safeCheckpoint(
        checkpoint_end_ms,
        "KDS_RUNTIME_CHECKPOINT_INVALID"
      );

    if (checkpoint === null) {
      throw adapterError(
        "KDS_RUNTIME_CHECKPOINT_INVALID"
      );
    }

    const row =
      oneRow(
        await rpc(
          COMMIT_RPC,
          {
            p_company_uid:
              normalizedScope
                .company_uid,

            p_brand_uid:
              normalizedScope
                .brand_uid,

            p_store_uid:
              normalizedScope
                .store_uid,

            p_lease_token:
              token,

            p_checkpoint_end_ms:
              checkpoint
          },
          "KDS_RUNTIME_CHECKPOINT_COMMIT_FAILED"
        ),
        "KDS_RUNTIME_CHECKPOINT_COMMIT_RESULT_INVALID"
      );

    if (
      row.committed !==
        true
    ) {
      throw adapterError(
        "KDS_RUNTIME_CHECKPOINT_NOT_COMMITTED"
      );
    }

    return Object.freeze({
      committed:
        true,

      checkpoint_end_ms:
        safeCheckpoint(
          row.checkpoint_end_ms,
          "KDS_RUNTIME_CHECKPOINT_COMMIT_RESULT_INVALID"
        )
    });
  }

  async function release({
    scope,
    lease_token
  } = {}) {
    const normalizedScope =
      validateScope(
        scope
      );

    const token =
      requiredString(
        lease_token,
        "KDS_RUNTIME_LEASE_TOKEN_REQUIRED"
      );

    const row =
      oneRow(
        await rpc(
          RELEASE_RPC,
          {
            p_company_uid:
              normalizedScope
                .company_uid,

            p_brand_uid:
              normalizedScope
                .brand_uid,

            p_store_uid:
              normalizedScope
                .store_uid,

            p_lease_token:
              token
          },
          "KDS_RUNTIME_LEASE_RELEASE_FAILED"
        ),
        "KDS_RUNTIME_LEASE_RELEASE_RESULT_INVALID"
      );

    if (
      typeof row.released !==
        "boolean"
    ) {
      throw adapterError(
        "KDS_RUNTIME_LEASE_RELEASE_RESULT_INVALID"
      );
    }

    return Object.freeze({
      released:
        row.released
    });
  }

  return Object.freeze({
    acquire,
    renew,
    commit,
    release
  });
}

module.exports = {
  ACQUIRE_RPC,
  COMMIT_RPC,
  RENEW_RPC,
  RELEASE_RPC,
  createFabiKdsRuntimeLeaseDbAdapterV1
};
