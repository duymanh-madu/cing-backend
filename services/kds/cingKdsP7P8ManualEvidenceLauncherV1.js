"use strict";

const crypto = require("node:crypto");

const {
  SHADOW_TARGET
} = require("./cingKdsFabiShadowPilotPolicyV1");

const {
  createSourceMappingEvidence
} = require("./cingKdsSourceMappingEvidenceV1");

const {
  evaluateReleaseReconciliation
} = require("./cingKdsReleaseReconciliationV1");

const {
  createKdsP7P8EvidenceDbAdapterV1
} = require("./cingKdsP7P8EvidenceDbAdapterV1");

const P7P8_CONFIRMATION = "CING_KDS_P7_P8_EVIDENCE_RUN_ONCE_V1";

function launcherError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredFunction(value, code) {
  if (typeof value !== "function") {
    throw launcherError(code);
  }
  return value;
}

function requiredString(value, code) {
  if (typeof value !== "string" || !value.trim()) {
    throw launcherError(code);
  }
  return value.trim();
}

function safeCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]{3,120}$/.test(error.code)
    ? error.code
    : "KDS_P7P8_EVIDENCE_FAILED";
}

function branchEquals(left, right) {
  return left.pos_parent === right.pos_parent && left.pos_id === right.pos_id;
}

function approvedTarget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw launcherError("KDS_P7P8_TARGET_REQUIRED");
  }

  const target = Object.freeze({
    pos_parent: requiredString(value.pos_parent, "KDS_P7P8_POS_PARENT_REQUIRED"),
    pos_id: requiredString(value.pos_id, "KDS_P7P8_POS_ID_REQUIRED")
  });

  if (!branchEquals(target, SHADOW_TARGET)) {
    throw launcherError("KDS_P7P8_TARGET_NOT_APPROVED");
  }

  return target;
}

function createKdsP7P8ManualEvidenceLauncherV1({
  configurationProvider,
  createSupabaseClient,
  collectSourceEvidence,
  createEvidenceDbAdapter = createKdsP7P8EvidenceDbAdapterV1,
  keyFromDigest = digest => {
    const hex = crypto.createHash("sha256").update(digest).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${(Number.parseInt(hex[16], 16) & 0x3 | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }
} = {}) {
  const loadConfiguration = requiredFunction(configurationProvider, "KDS_P7P8_CONFIGURATION_REQUIRED");
  const createClient = requiredFunction(createSupabaseClient, "KDS_P7P8_SUPABASE_FACTORY_REQUIRED");
  const collect = requiredFunction(collectSourceEvidence, "KDS_P7P8_SOURCE_COLLECTOR_REQUIRED");
  const createAdapter = requiredFunction(createEvidenceDbAdapter, "KDS_P7P8_DB_ADAPTER_FACTORY_REQUIRED");
  const deriveKey = requiredFunction(keyFromDigest, "KDS_P7P8_KEY_PROVIDER_REQUIRED");
  let started = false;

  async function runOnce({ confirmation } = {}) {
    if (started) {
      throw launcherError("KDS_P7P8_ALREADY_STARTED");
    }

    if (confirmation !== P7P8_CONFIRMATION) {
      throw launcherError("KDS_P7P8_CONFIRMATION_REQUIRED");
    }

    started = true;

    try {
      const config = await loadConfiguration();
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw launcherError("KDS_P7P8_CONFIGURATION_INVALID");
      }

      const target = approvedTarget(config.target);

      const supabaseConfig = Object.freeze({
        SUPABASE_URL: requiredString(config.SUPABASE_URL, "KDS_P7P8_SUPABASE_URL_REQUIRED"),
        SUPABASE_SERVICE_ROLE_KEY: requiredString(config.SUPABASE_SERVICE_ROLE_KEY, "KDS_P7P8_SUPABASE_KEY_REQUIRED")
      });

      const supabase = createClient(supabaseConfig);
      if (!supabase || typeof supabase.rpc !== "function") {
        throw launcherError("KDS_P7P8_SUPABASE_CLIENT_INVALID");
      }

      const collected = await collect(Object.freeze({ target }));
      if (!collected || typeof collected !== "object" || Array.isArray(collected)) {
        throw launcherError("KDS_P7P8_SOURCE_EVIDENCE_INVALID");
      }

      const mapping = createSourceMappingEvidence({
        target,
        source_observation: collected.source_observation
      });

      const reconciliation = evaluateReleaseReconciliation({
        branch: target,
        snapshot: collected.reconciliation_snapshot
      });

      if (!branchEquals(mapping.branch, reconciliation.branch)) {
        throw launcherError("KDS_P7P8_BRANCH_MISMATCH");
      }

      const adapter = createAdapter({ supabase });
      const mappingKey = await deriveKey(mapping.mapping_fingerprint);
      const mappingRecorded = await adapter.recordMapping({
        mapping_key: mappingKey,
        mapping
      });

      const reconciliationRecorded = await adapter.recordReconciliation({
        reconciliation_key: await deriveKey(
          JSON.stringify({
            mapping_fingerprint: mapping.mapping_fingerprint,
            source_snapshot_complete: reconciliation.source_snapshot_complete,
            recovery_complete: reconciliation.recovery_complete,
            modifiers_verified: reconciliation.modifiers_verified,
            metrics: reconciliation.metrics
          })
        ),
        mapping_key: mappingKey,
        reconciliation
      });

      return Object.freeze({
        status: reconciliation.status === "pass" ? "evidence_recorded" : "hold",
        error_code: reconciliation.status === "pass" ? null : "KDS_P8_RECONCILIATION_HOLD",
        mapping_status: mappingRecorded.status,
        reconciliation_status: reconciliationRecorded.status,
        mapping_record_state: mappingRecorded.record_state,
        reconciliation_record_state: reconciliationRecorded.record_state,
        branch: mapping.branch,
        metrics: reconciliation.metrics,
        read_enabled: false
      });
    } catch (error) {
      return Object.freeze({
        status: "hold",
        error_code: safeCode(error),
        mapping_status: null,
        reconciliation_status: null,
        mapping_record_state: null,
        reconciliation_record_state: null,
        branch: null,
        metrics: null,
        read_enabled: false
      });
    }
  }

  return Object.freeze({ runOnce });
}

module.exports = {
  P7P8_CONFIRMATION,
  createKdsP7P8ManualEvidenceLauncherV1
};
