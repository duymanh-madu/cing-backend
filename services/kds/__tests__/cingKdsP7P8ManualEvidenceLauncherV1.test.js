"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  P7P8_CONFIRMATION,
  createKdsP7P8ManualEvidenceLauncherV1
} = require("../cingKdsP7P8ManualEvidenceLauncherV1");

const {
  MAPPING_RPC,
  RECONCILIATION_RPC,
  createKdsP7P8EvidenceDbAdapterV1
} = require("../cingKdsP7P8EvidenceDbAdapterV1");

const TARGET = Object.freeze({ pos_parent: "BRAND-DQIR", pos_id: "109664" });
const SOURCE = Object.freeze({
  source_observation: {
    ...TARGET,
    company_uid: "d1627d1b-4ad8-4c2b-86ff-76d70b9b8cad",
    brand_uid: "d76e55e9-5b31-48da-987d-d096b8a4793c",
    store_uid: "4aac4b7a-e846-4a40-992a-1cab735c9a4f",
    source_observed_at: "2026-10-21T10:00:00Z",
    evidence_digest: "e4b0b89dcf48a1bf4c8c8a3d9c51975cc46972e64dcff7f74c998aadfb4951f1"
  },
  reconciliation_snapshot: {
    ...TARGET,
    source_invoice_count: 3,
    projected_invoice_count: 3,
    missing_invoice_count: 0,
    extra_invoice_count: 0,
    item_pass_count: 3,
    item_fail_count: 0,
    cup_expected_count: 7,
    cup_projected_count: 7,
    source_snapshot_complete: true,
    recovery_complete: true,
    modifiers_verified: true
  }
});

function createSupabase(calls) {
  return {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === MAPPING_RPC) {
        return { data: [{ record_state: "inserted", mapping_status: "source_verified" }], error: null };
      }
      if (name === RECONCILIATION_RPC) {
        return { data: [{ record_state: "inserted", reconciliation_status: "pass" }], error: null };
      }
      return { data: null, error: { message: "unexpected" } };
    }
  };
}

test("missing confirmation performs no configuration, source collection, or database action", async () => {
  let configurationCalls = 0;
  let sourceCalls = 0;
  const launcher = createKdsP7P8ManualEvidenceLauncherV1({
    configurationProvider: async () => { configurationCalls++; return {}; },
    createSupabaseClient: () => ({ rpc() {} }),
    collectSourceEvidence: async () => { sourceCalls++; return SOURCE; }
  });

  await assert.rejects(() => launcher.runOnce(), /KDS_P7P8_CONFIRMATION_REQUIRED/);
  assert.equal(configurationCalls, 0);
  assert.equal(sourceCalls, 0);
});

test("records source-verified mapping and aggregate reconciliation only", async () => {
  const calls = [];
  let sourceCalls = 0;
  const launcher = createKdsP7P8ManualEvidenceLauncherV1({
    configurationProvider: async () => ({
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "test-only",
      target: TARGET
    }),
    createSupabaseClient: () => createSupabase(calls),
    collectSourceEvidence: async ({ target }) => {
      sourceCalls++;
      assert.deepEqual(target, TARGET);
      return SOURCE;
    }
  });

  const result = await launcher.runOnce({ confirmation: P7P8_CONFIRMATION });
  assert.equal(sourceCalls, 1);
  assert.equal(result.status, "evidence_recorded");
  assert.equal(result.read_enabled, false);
  assert.equal(result.mapping_status, "source_verified");
  assert.equal(result.reconciliation_status, "pass");
  assert.deepEqual(calls.map(call => call.name), [MAPPING_RPC, RECONCILIATION_RPC]);
  assert.equal(calls[1].args.p_mapping_key, calls[0].args.p_mapping_key);
  assert.equal(JSON.stringify(result).includes("d1627d1b"), false);
  assert.equal(JSON.stringify(result).includes("e4b0b89d"), false);
});

test("incomplete reconciliation records hold but never enables reading", async () => {
  const calls = [];
  const launcher = createKdsP7P8ManualEvidenceLauncherV1({
    configurationProvider: async () => ({
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "test-only",
      target: TARGET
    }),
    createSupabaseClient: () => ({
      rpc: async (name, args) => {
        calls.push({ name, args });
        return name === MAPPING_RPC
          ? { data: [{ record_state: "inserted", mapping_status: "source_verified" }], error: null }
          : { data: [{ record_state: "inserted", reconciliation_status: "hold" }], error: null };
      }
    }),
    collectSourceEvidence: async () => ({
      ...SOURCE,
      reconciliation_snapshot: { ...SOURCE.reconciliation_snapshot, item_fail_count: 1 }
    })
  });

  const result = await launcher.runOnce({ confirmation: P7P8_CONFIRMATION });
  assert.equal(result.status, "hold");
  assert.equal(result.error_code, "KDS_P8_RECONCILIATION_HOLD");
  assert.equal(result.read_enabled, false);
  assert.equal(calls.length, 2);
});

test("adapter uses exactly the two private P7/P8 RPCs and hides database errors", async () => {
  const adapter = createKdsP7P8EvidenceDbAdapterV1({
    supabase: { rpc: async () => { throw new Error("private database detail"); } }
  });
  await assert.rejects(
    () => adapter.recordMapping({ mapping_key: "x", mapping: {} }),
    error => error.code === "KDS_P7_MAPPING_RECORD_FAILED" && !error.message.includes("private")
  );
  await assert.rejects(
    () => adapter.recordReconciliation({ reconciliation_key: "x", mapping_key: "y", reconciliation: { metrics: {} } }),
    error => error.code === "KDS_P8_RECONCILIATION_RECORD_FAILED" && !error.message.includes("private")
  );
});

test("P7-P8 manual source owns no environment, network, timer, server mount, or P9 release write", () => {
  const root = path.resolve(__dirname, "../../..");
  const files = [
    "services/kds/cingKdsP7P8ManualEvidenceLauncherV1.js",
    "services/kds/cingKdsP7P8EvidenceDbAdapterV1.js"
  ];
  const source = files.map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.doesNotMatch(source, /process\.env|fetch\s*\(|axios|set(?:Interval|Timeout)\s*\(|server\.listen|app\.use|read_release_gate_set_p9/i);
});
