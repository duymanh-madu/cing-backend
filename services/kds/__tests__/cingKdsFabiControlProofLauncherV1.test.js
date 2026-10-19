"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  RUN_CONFIRMATION,
  createFabiKdsControlProofLauncherV1
} = require("../cingKdsFabiControlProofLauncherV1");

const SCOPE = Object.freeze({
  company_uid: "d1627d1b-4ad8-4c2b-86ff-76d70b9b8cad",
  brand_uid: "d76e55e9-5b31-48da-987d-d096b8a4793c",
  store_uid: "4aac4b7a-e846-4a40-992a-1cab735c9a4f"
});

function base(overrides = {}) {
  let now = 10_000;
  return {
    approvedScope: SCOPE,
    configurationProvider: async () => ({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test-only",
      IPOS_TOKEN: "foodhub-test-only",
      IPOS_ACCESS_TOKEN: "foodhub-test-only"
    }),
    createSupabaseClient: () => ({ rpc: async () => ({ data: [], error: null }) }),
    requestFn: async () => ({ status: 200, body: { data: [] }, json: { data: [] } }),
    nowProvider: () => now,
    createCredentialComposition: () => ({ c04HttpClient: {}, c03HttpClient: {} }),
    createDurableDbAdapter: () => ({}),
    createRuntimeLeaseAdapter: () => ({}),
    createReconciliationQueueAdapter: () => ({}),
    createRuntimeComposition: () => ({
      runOnce: async () => ({
        status: "committed",
        polled: true,
        checkpoint_committed: true,
        transaction_count: 2,
        fetched_event_count: 3,
        durable_event_count: 3,
        retries_claimed: 1,
        retries_resolved: 1
      })
    }),
    advance: ms => { now += ms; },
    ...overrides
  };
}

test("construction is dormant and reads neither configuration nor network", () => {
  let configReads = 0;
  let clients = 0;
  const deps = base({
    configurationProvider: async () => {
      configReads++;
      return {};
    },
    createSupabaseClient: () => {
      clients++;
      return { rpc: async () => ({}) };
    }
  });

  const launcher = createFabiKdsControlProofLauncherV1(deps);
  assert.equal(typeof launcher.runOnce, "function");
  assert.equal(configReads, 0);
  assert.equal(clients, 0);
});

test("missing explicit confirmation performs no configuration or production action", async () => {
  let configReads = 0;
  const deps = base({
    configurationProvider: async () => {
      configReads++;
      return {};
    }
  });
  const launcher = createFabiKdsControlProofLauncherV1(deps);

  await assert.rejects(() => launcher.runOnce(), /KDS_CONTROL_PROOF_CONFIRMATION_REQUIRED/);
  assert.equal(configReads, 0);
});

test("one explicit run returns aggregate evidence without secrets or transaction identifiers", async () => {
  const launcher = createFabiKdsControlProofLauncherV1(base());
  const evidence = await launcher.runOnce({ confirmation: RUN_CONFIRMATION });

  assert.equal(evidence.status, "completed");
  assert.equal(evidence.runner.transaction_count, 2);
  assert.equal(evidence.runner.fetched_event_count, 3);
  assert.equal(JSON.stringify(evidence).includes("foodhub-test-only"), false);
  assert.equal(JSON.stringify(evidence).includes("service-role-test-only"), false);
  assert.equal(JSON.stringify(evidence).includes("tran_id"), false);
});

test("configuration failure holds before client construction", async () => {
  let clients = 0;
  const launcher = createFabiKdsControlProofLauncherV1(base({
    configurationProvider: async () => ({
      SUPABASE_URL: "https://example.supabase.co"
    }),
    createSupabaseClient: () => {
      clients++;
      return { rpc: async () => ({}) };
    }
  }));

  const evidence = await launcher.runOnce({ confirmation: RUN_CONFIRMATION });
  assert.equal(evidence.status, "hold");
  assert.equal(evidence.error_code, "KDS_CONTROL_PROOF_SUPABASE_KEY_REQUIRED");
  assert.equal(clients, 0);
});

test("deadline stops a run before runtime execution", async () => {
  let runs = 0;
  const deps = base({
    nowProvider: (() => {
      const values = [0, 0, 110_000];
      return () => values.shift() ?? 110_000;
    })(),
    createRuntimeComposition: () => ({
      runOnce: async () => {
        runs++;
        return {};
      }
    })
  });
  const launcher = createFabiKdsControlProofLauncherV1(deps);
  const evidence = await launcher.runOnce({ confirmation: RUN_CONFIRMATION });
  assert.equal(evidence.status, "hold");
  assert.equal(evidence.error_code, "KDS_CONTROL_PROOF_DEADLINE_EXCEEDED");
  assert.equal(runs, 0);
});

test("launcher source owns no scheduler or unredacted console output", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "cingKdsFabiControlProofLauncherV1.js"), "utf8");
  const executableSource = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  for (const forbidden of [/set(?:Interval|Timeout)\s*\(/, /console\s*\./, /process\s*\.env/, /server\.listen/]) {
    assert.doesNotMatch(executableSource, forbidden);
  }
});
