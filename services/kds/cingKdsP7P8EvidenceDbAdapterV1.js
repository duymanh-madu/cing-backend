"use strict";

const MAPPING_RPC = "cing_kds_source_mapping_record_p7_v1";
const RECONCILIATION_RPC = "cing_kds_reconciliation_record_p8_v1";

function adapterError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw adapterError(code);
  }
  return value;
}

function resultState(result, expectedStatus, code) {
  if (!result || result.error || !Array.isArray(result.data) || result.data.length !== 1) {
    throw adapterError(code);
  }

  const row = result.data[0];
  if (!row || (row.record_state !== "inserted" && row.record_state !== "duplicate") || row[expectedStatus] === undefined) {
    throw adapterError(code);
  }

  return Object.freeze({
    record_state: row.record_state,
    status: row[expectedStatus]
  });
}

function createKdsP7P8EvidenceDbAdapterV1({ supabase } = {}) {
  if (!supabase || typeof supabase.rpc !== "function") {
    throw adapterError("KDS_P7P8_RPC_CLIENT_REQUIRED");
  }

  async function recordMapping({ mapping_key, mapping } = {}) {
    const evidence = requiredObject(mapping, "KDS_P7_MAPPING_EVIDENCE_REQUIRED");

    let result;
    try {
      result = await supabase.rpc(MAPPING_RPC, {
        p_mapping_key: mapping_key,
        p_pos_parent: evidence.branch?.pos_parent,
        p_pos_id: evidence.branch?.pos_id,
        p_company_uid: evidence.fabi_scope?.company_uid,
        p_brand_uid: evidence.fabi_scope?.brand_uid,
        p_store_uid: evidence.fabi_scope?.store_uid,
        p_source_observed_at: evidence.source_observed_at,
        p_evidence_digest: evidence.evidence_digest
      });
    } catch (_) {
      throw adapterError("KDS_P7_MAPPING_RECORD_FAILED");
    }

    return resultState(result, "mapping_status", "KDS_P7_MAPPING_RECORD_FAILED");
  }

  async function recordReconciliation({ reconciliation_key, mapping_key, reconciliation } = {}) {
    const evidence = requiredObject(reconciliation, "KDS_P8_RECONCILIATION_EVIDENCE_REQUIRED");
    const metrics = requiredObject(evidence.metrics, "KDS_P8_RECONCILIATION_EVIDENCE_REQUIRED");

    let result;
    try {
      result = await supabase.rpc(RECONCILIATION_RPC, {
        p_reconciliation_key: reconciliation_key,
        p_mapping_key: mapping_key,
        p_pos_parent: evidence.branch?.pos_parent,
        p_pos_id: evidence.branch?.pos_id,
        p_source_invoice_count: metrics.source_invoice_count,
        p_projected_invoice_count: metrics.projected_invoice_count,
        p_missing_invoice_count: metrics.missing_invoice_count,
        p_extra_invoice_count: metrics.extra_invoice_count,
        p_item_pass_count: metrics.item_pass_count,
        p_item_fail_count: metrics.item_fail_count,
        p_cup_expected_count: metrics.cup_expected_count,
        p_cup_projected_count: metrics.cup_projected_count,
        p_source_snapshot_complete: evidence.source_snapshot_complete,
        p_recovery_complete: evidence.recovery_complete,
        p_modifiers_verified: evidence.modifiers_verified
      });
    } catch (_) {
      throw adapterError("KDS_P8_RECONCILIATION_RECORD_FAILED");
    }

    return resultState(result, "reconciliation_status", "KDS_P8_RECONCILIATION_RECORD_FAILED");
  }

  return Object.freeze({ recordMapping, recordReconciliation });
}

module.exports = {
  MAPPING_RPC,
  RECONCILIATION_RPC,
  createKdsP7P8EvidenceDbAdapterV1
};
