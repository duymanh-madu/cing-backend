"use strict";

const RECORD_RPC = "cing_kds_shadow_pilot_observation_record_v1";

function adapterError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createFabiShadowPilotDbAdapterV1({ supabase } = {}) {
  if (!supabase || typeof supabase.rpc !== "function") {
    throw adapterError("KDS_SHADOW_RPC_CLIENT_REQUIRED");
  }

  async function record(evidence) {
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
      throw adapterError("KDS_SHADOW_RECORD_EVIDENCE_REQUIRED");
    }

    let result;
    try {
      result = await supabase.rpc(RECORD_RPC, {
        p_observation_key: evidence.observation_key,
        p_pos_parent: evidence.pos_parent,
        p_pos_id: evidence.pos_id,
        p_company_uid: evidence.company_uid,
        p_brand_uid: evidence.brand_uid,
        p_store_uid: evidence.store_uid,
        p_mapping_status: evidence.mapping_status,
        p_status: evidence.status,
        p_error_code: evidence.error_code,
        p_duration_ms: evidence.duration_ms,
        p_c03_count: evidence.c03.count,
        p_c03_timeout_count: evidence.c03.timeout_count,
        p_c03_max_duration_ms: evidence.c03.max_duration_ms,
        p_c04_count: evidence.c04.count,
        p_c04_timeout_count: evidence.c04.timeout_count,
        p_c04_max_duration_ms: evidence.c04.max_duration_ms,
        p_runner_status: evidence.runner?.status ?? null,
        p_polled: evidence.runner?.polled ?? false,
        p_checkpoint_committed: evidence.runner?.checkpoint_committed ?? false,
        p_transaction_count: evidence.runner?.transaction_count ?? 0,
        p_fetched_event_count: evidence.runner?.fetched_event_count ?? 0,
        p_durable_event_count: evidence.runner?.durable_event_count ?? 0,
        p_retries_claimed: evidence.runner?.retries_claimed ?? 0,
        p_retries_resolved: evidence.runner?.retries_resolved ?? 0
      });
    } catch (_) {
      throw adapterError("KDS_SHADOW_RECORD_FAILED");
    }

    if (!result || result.error || !Array.isArray(result.data) || result.data.length !== 1) {
      throw adapterError("KDS_SHADOW_RECORD_FAILED");
    }
    const row = result.data[0];
    if (!row || (row.record_state !== "inserted" && row.record_state !== "duplicate")) {
      throw adapterError("KDS_SHADOW_RECORD_RESULT_INVALID");
    }
    return Object.freeze({ record_state: row.record_state });
  }

  return Object.freeze({ record });
}

module.exports = {
  RECORD_RPC,
  createFabiShadowPilotDbAdapterV1
};
