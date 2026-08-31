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

const MATERIALIZE_CONTEXT_RPC_NAME =
  "cing_artillery_materialize_shot_execution_context_atomic";

const COMMIT_RESOLUTION_RPC_NAME =
  "cing_artillery_commit_resolution_fenced_atomic";

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


async function materializeContextAtomic({
  executionId,
  claimToken,
}) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      MATERIALIZE_CONTEXT_RPC_NAME,
      {
        p_execution_id:
          executionId,
        p_claim_token:
          claimToken,
      }
    );

  if (error) {
    throw error;
  }

  return data || null;
}

async function commitResolutionFencedAtomic({
  executionId,
  claimToken,
  projection,
}) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      COMMIT_RESOLUTION_RPC_NAME,
      {
        p_execution_id:
          executionId,
        p_claim_token:
          claimToken,

        p_physics_version:
          projection.physics_version,
        p_outcome:
          projection.outcome,

        p_impact_exact_version:
          projection.impact_exact_version,
        p_impact_physics_fixed_scale:
          projection.impact_physics_fixed_scale,
        p_impact_start_x_scaled:
          projection.impact_start_x_scaled,
        p_impact_start_y_scaled:
          projection.impact_start_y_scaled,
        p_impact_delta_x_scaled:
          projection.impact_delta_x_scaled,
        p_impact_delta_y_scaled:
          projection.impact_delta_y_scaled,
        p_impact_contact_kind:
          projection.impact_contact_kind,
        p_impact_contact_numerator:
          projection.impact_contact_numerator,
        p_impact_contact_denominator:
          projection.impact_contact_denominator,
        p_impact_contact_a:
          projection.impact_contact_a,
        p_impact_contact_b:
          projection.impact_contact_b,
        p_impact_contact_discriminant:
          projection.impact_contact_discriminant,

        p_impact_projection_version:
          projection.impact_projection_version,
        p_impact_x:
          projection.impact_x,
        p_impact_y:
          projection.impact_y,

        p_target_account_id:
          projection.target_account_id,
        p_damage:
          projection.damage,
      }
    );

  if (error) {
    throw error;
  }

  return Array.isArray(data)
    ? data[0] || null
    : data || null;
}

module.exports = {
  claimAtomic,
  releaseAtomic,
  releaseExpiredAtomic,
  materializeContextAtomic,
  commitResolutionFencedAtomic,
};
