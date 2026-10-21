"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  SHADOW_PILOT_CONFIRMATION,
  SHADOW_TARGET,
  validateShadowPilotScope
} = require("../cingKdsFabiShadowPilotPolicyV1");

const {
  createShadowPilotEvidence
} = require("../cingKdsFabiShadowPilotEvidenceV1");

const {
  RECORD_RPC,
  createFabiShadowPilotDbAdapterV1
} = require("../cingKdsFabiShadowPilotDbAdapterV1");

const {
  createFabiKdsShadowPilotLauncherV1
} = require("../cingKdsFabiShadowPilotLauncherV1");

const FABi_SCOPE = Object.freeze({
  company_uid: "d1627d1b-4ad8-4c2b-86ff-76d70b9b8cad",
  brand_uid: "d76e55e9-5b31-48da-987d-d096b8a4793c",
  store_uid: "4aac4b7a-e846-4a40-992a-1cab735c9a4f"
});

const OBSERVATION_KEY = "71e45623-e234-4df2-9df7-8cc0d1821a73";

function proof(overrides = {}) {
  return {
    status: "completed",
    error_code: null,
    duration_ms: 3500,
    c03: { count: 0, timeout_count: 0, max_duration_ms: 0 },
    c04: { count: 1, timeout_count: 0, max_duration_ms: 900 },
    runner: {
      status: "committed",
      polled: true,
      checkpoint_committed: true,
      transaction_count: 0,
      fetched_event_count: 0,
      durable_event_count: 0,
      retries_claimed: 0,
      retries_resolved: 0
    },
    ...overrides
  };
}

function config() {
  return {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-only",
    KDS_FABI_AUTHORIZATION: "Bearer test-only",
    KDS_FABI_ACCESS_TOKEN: "app-test-only",
    target: { ...SHADOW_TARGET },
    fabi_scope: FABi_SCOPE
  };
}

test("policy binds exactly one iPOS target and never treats UUID configuration as verified mapping", () => {
  const scope = validateShadowPilotScope({ target: SHADOW_TARGET, fabi_scope: FABi_SCOPE });
  assert.equal(scope.target.pos_parent, "BRAND-DQIR");
  assert.equal(scope.target.pos_id, "109664");
  assert.equal(scope.mapping_status, "configured_not_source_verified");
  assert.throws(
    () => validateShadowPilotScope({ target: { pos_parent: "BRAND-DQIR", pos_id: "other" }, fabi_scope: FABi_SCOPE }),
    /KDS_SHADOW_TARGET_NOT_APPROVED/
  );
});

test("evidence is aggregate-only and makes a non-committed proof hold", () => {
  const evidence = createShadowPilotEvidence({
    observation_key: OBSERVATION_KEY,
    scope: { target: SHADOW_TARGET, fabi_scope: FABi_SCOPE },
    proof: proof()
  });
  assert.equal(evidence.status, "observed");
  assert.equal(JSON.stringify(evidence).includes("service-role-test-only"), false);
  assert.equal(JSON.stringify(evidence).includes("tran_id"), false);
  const held = createShadowPilotEvidence({
    observation_key: OBSERVATION_KEY,
    scope: { target: SHADOW_TARGET, fabi_scope: FABi_SCOPE },
    proof: proof({ status: "hold", error_code: "C04_AUTH_REQUIRED", runner: null })
  });
  assert.equal(held.status, "hold");
  assert.equal(held.error_code, "C04_AUTH_REQUIRED");
});

test("adapter exposes exactly the private record RPC and sanitizes database errors", async () => {
  const calls = [];
  const adapter = createFabiShadowPilotDbAdapterV1({
    supabase: { rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: [{ record_state: "inserted" }], error: null };
    } }
  });
  const evidence = createShadowPilotEvidence({ observation_key: OBSERVATION_KEY, scope: { target: SHADOW_TARGET, fabi_scope: FABi_SCOPE }, proof: proof() });
  assert.deepEqual(await adapter.record(evidence), { record_state: "inserted" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, RECORD_RPC);
  assert.equal("tran_id" in calls[0].args, false);
  const failed = createFabiShadowPilotDbAdapterV1({ supabase: { rpc: async () => { throw new Error("private database text"); } } });
  await assert.rejects(() => failed.record(evidence), /KDS_SHADOW_RECORD_FAILED/);
});

test("launcher is one-shot, requires a P6 confirmation, and records aggregate evidence only", async () => {
  let configurationReads = 0;
  let proofInput;
  let recorded;
  const launcher = createFabiKdsShadowPilotLauncherV1({
    configurationProvider: async () => { configurationReads++; return config(); },
    createSupabaseClient: () => ({ rpc: async () => ({}) }),
    createControlProofLauncher: input => {
      proofInput = input;
      return { runOnce: async ({ confirmation }) => {
        assert.equal(confirmation, "CING_KDS_CONTROL_PROOF_RUN_ONCE_V1");
        return proof();
      } };
    },
    createShadowPilotDbAdapter: () => ({ record: async value => { recorded = value; return { record_state: "inserted" }; } }),
    observationKeyProvider: async () => OBSERVATION_KEY
  });
  await assert.rejects(() => launcher.runOnce(), /KDS_SHADOW_CONFIRMATION_REQUIRED/);
  assert.equal(configurationReads, 0);
  const result = await launcher.runOnce({ confirmation: SHADOW_PILOT_CONFIRMATION });
  assert.deepEqual(result, {
    status: "observed",
    error_code: null,
    target: SHADOW_TARGET,
    mapping_status: "configured_not_source_verified",
    record_state: "inserted"
  });
  assert.deepEqual(proofInput.approvedScope, FABi_SCOPE);
  assert.equal(recorded.pos_parent, "BRAND-DQIR");
  assert.equal(recorded.pos_id, "109664");
  await assert.rejects(() => launcher.runOnce({ confirmation: SHADOW_PILOT_CONFIRMATION }), /KDS_SHADOW_ALREADY_STARTED/);
});

test("migration mirrors are exact and remain an isolated service-role-only observation surface", () => {
  const root = path.resolve(__dirname, "../../..");
  const db = fs.readFileSync(path.join(root, "db/migrations/20261021170000_cing_kds_shadow_pilot_observation_p6_v1.sql"), "utf8");
  const supabase = fs.readFileSync(path.join(root, "supabase/migrations/20261021170000_cing_kds_shadow_pilot_observation_p6_v1.sql"), "utf8");
  assert.equal(db, supabase);
  assert.match(db, /pos_parent='BRAND-DQIR'/);
  assert.match(db, /pos_id='109664'/);
  assert.match(db, /enable row level security/i);
  assert.match(db, /revoke all on table[\s\S]*from public,anon,authenticated,service_role/i);
  assert.match(db, /security definer set search_path=public,pg_catalog,pg_temp/i);
  assert.match(db, /grant execute[\s\S]*to service_role/i);
  assert.doesNotMatch(db, /create trigger|pg_cron|http_request|net\.http/i);
});

test("P6 source owns no server mount, scheduler, or shared Foodhub credential reference", () => {
  const root = path.resolve(__dirname, "../../..");
  const files = [
    "services/kds/cingKdsFabiShadowPilotLauncherV1.js",
    "tools/runCingKdsFabiShadowPilotV1.js"
  ];
  const source = files.map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.doesNotMatch(source, /set(?:Interval|Timeout)\s*\(|server\.listen|app\.use/);
  assert.doesNotMatch(source, /process\.env\.IPOS_TOKEN|process\.env\.IPOS_ACCESS_TOKEN/);
  assert.match(source, /KDS_FABI_AUTHORIZATION/);
  assert.match(source, /KDS_FABI_ACCESS_TOKEN/);
});
