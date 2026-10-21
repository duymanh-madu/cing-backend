"use strict";

const crypto = require("node:crypto");

const {
  RUN_CONFIRMATION,
  createFabiKdsControlProofLauncherV1
} = require("./cingKdsFabiControlProofLauncherV1");

const {
  SHADOW_PILOT_CONFIRMATION,
  validateShadowPilotScope
} = require("./cingKdsFabiShadowPilotPolicyV1");

const {
  createShadowPilotEvidence
} = require("./cingKdsFabiShadowPilotEvidenceV1");

const {
  createFabiShadowPilotDbAdapterV1
} = require("./cingKdsFabiShadowPilotDbAdapterV1");

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
    : "KDS_SHADOW_PILOT_FAILED";
}

function createFabiKdsShadowPilotLauncherV1({
  configurationProvider,
  createSupabaseClient,
  createControlProofLauncher = createFabiKdsControlProofLauncherV1,
  createShadowPilotDbAdapter = createFabiShadowPilotDbAdapterV1,
  observationKeyProvider = crypto.randomUUID,
  controlProofDependencies = {}
} = {}) {
  const loadConfiguration = requiredFunction(configurationProvider, "KDS_SHADOW_CONFIGURATION_REQUIRED");
  const createClient = requiredFunction(createSupabaseClient, "KDS_SHADOW_SUPABASE_FACTORY_REQUIRED");
  const createProof = requiredFunction(createControlProofLauncher, "KDS_SHADOW_CONTROL_PROOF_FACTORY_REQUIRED");
  const createAdapter = requiredFunction(createShadowPilotDbAdapter, "KDS_SHADOW_DB_ADAPTER_FACTORY_REQUIRED");
  const nextObservationKey = requiredFunction(observationKeyProvider, "KDS_SHADOW_OBSERVATION_KEY_PROVIDER_REQUIRED");
  let started = false;

  async function runOnce({ confirmation } = {}) {
    if (started) {
      throw launcherError("KDS_SHADOW_ALREADY_STARTED");
    }
    if (confirmation !== SHADOW_PILOT_CONFIRMATION) {
      throw launcherError("KDS_SHADOW_CONFIRMATION_REQUIRED");
    }
    started = true;

    let config;
    let normalizedScope;
    let adapter;
    try {
      config = await loadConfiguration();
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw launcherError("KDS_SHADOW_CONFIGURATION_INVALID");
      }
      normalizedScope = validateShadowPilotScope({
        target: config.target,
        fabi_scope: config.fabi_scope
      });
      const safeConfig = Object.freeze({
        SUPABASE_URL: requiredString(config.SUPABASE_URL, "KDS_SHADOW_SUPABASE_URL_REQUIRED"),
        SUPABASE_SERVICE_ROLE_KEY: requiredString(config.SUPABASE_SERVICE_ROLE_KEY, "KDS_SHADOW_SUPABASE_KEY_REQUIRED"),
        IPOS_TOKEN: requiredString(config.KDS_FABI_AUTHORIZATION, "KDS_FABI_IPOS_AUTH_REQUIRED"),
        IPOS_ACCESS_TOKEN: requiredString(config.KDS_FABI_ACCESS_TOKEN, "KDS_FABI_IPOS_APP_ACCESS_REQUIRED")
      });
      const supabase = createClient(safeConfig);
      if (!supabase || typeof supabase.rpc !== "function") {
        throw launcherError("KDS_SHADOW_SUPABASE_CLIENT_INVALID");
      }
      adapter = createAdapter({ supabase });
      const proofLauncher = createProof({
        ...controlProofDependencies,
        approvedScope: normalizedScope.fabi_scope,
        configurationProvider: async () => safeConfig,
        createSupabaseClient: createClient
      });
      const proof = await proofLauncher.runOnce({ confirmation: RUN_CONFIRMATION });
      const evidence = createShadowPilotEvidence({
        observation_key: await nextObservationKey(),
        scope: normalizedScope,
        proof
      });
      const persisted = await adapter.record(evidence);
      return Object.freeze({
        status: evidence.status,
        error_code: evidence.error_code,
        target: evidence.status === "observed" ? normalizedScope.target : null,
        mapping_status: normalizedScope.mapping_status,
        record_state: persisted.record_state
      });
    } catch (error) {
      return Object.freeze({
        status: "hold",
        error_code: safeCode(error),
        target: null,
        mapping_status: normalizedScope?.mapping_status ?? null,
        record_state: null
      });
    }
  }

  return Object.freeze({ runOnce });
}

module.exports = {
  SHADOW_PILOT_CONFIRMATION,
  createFabiKdsShadowPilotLauncherV1
};
