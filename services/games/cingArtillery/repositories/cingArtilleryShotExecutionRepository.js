const supabase =
  require(
    "../../../../supabase"
  );

const CLAIM_RPC_NAME =
  "cing_artillery_claim_shot_executions_atomic";

const RELEASE_RPC_NAME =
  "cing_artillery_release_shot_execution_atomic";

const RELEASE_EXPIRED_RPC_NAME =
  "cing_artillery_release_expired_shot_executions_atomic";

async function claimAtomic({
  limit,
  leaseMs,
}) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      CLAIM_RPC_NAME,
      {
        p_limit:
          limit,

        p_lease_ms:
          leaseMs,
      }
    );

  if (error) {
    throw error;
  }

  return Array.isArray(data)
    ? data
    : data
      ? [data]
      : [];
}

async function releaseAtomic({
  executionId,
  claimToken,
  lastError,
}) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      RELEASE_RPC_NAME,
      {
        p_execution_id:
          executionId,

        p_claim_token:
          claimToken,

        p_last_error:
          lastError,
      }
    );

  if (error) {
    throw error;
  }

  return Array.isArray(data)
    ? data[0] || null
    : data || null;
}

async function releaseExpiredAtomic({
  limit,
}) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      RELEASE_EXPIRED_RPC_NAME,
      {
        p_limit:
          limit,
      }
    );

  if (error) {
    throw error;
  }

  return Array.isArray(data)
    ? data
    : data
      ? [data]
      : [];
}

module.exports = {
  claimAtomic,
  releaseAtomic,
  releaseExpiredAtomic,
};
