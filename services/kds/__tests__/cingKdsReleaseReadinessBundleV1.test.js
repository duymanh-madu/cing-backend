"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createSourceMappingEvidence
} = require("../cingKdsSourceMappingEvidenceV1");

const {
  evaluateReleaseReconciliation
} = require("../cingKdsReleaseReconciliationV1");

const {
  authorizeKdsReadRelease
} = require("../cingKdsReadReleaseGateV1");

const {
  createKdsReadOnlyOperationsRouterV1
} = require("../cingKdsReadOnlyOperationsCompositionV1");

const BRANCH = Object.freeze({ pos_parent: "BRAND-DQIR", pos_id: "109664" });

const OBSERVATION = Object.freeze({
  ...BRANCH,
  company_uid: "d1627d1b-4ad8-4c2b-86ff-76d70b9b8cad",
  brand_uid: "d76e55e9-5b31-48da-987d-d096b8a4793c",
  store_uid: "4aac4b7a-e846-4a40-992a-1cab735c9a4f",
  source_observed_at: "2026-10-21T10:00:00Z",
  evidence_digest: "e4b0b89dcf48a1bf4c8c8a3d9c51975cc46972e64dcff7f74c998aadfb4951f1"
});

function reconciliation(overrides = {}) {
  return evaluateReleaseReconciliation({
    branch: BRANCH,
    snapshot: {
      ...BRANCH,
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
      modifiers_verified: true,
      ...overrides
    }
  });
}

test("P7 accepts only source evidence that proves the exact branch mapping", () => {
  const mapping = createSourceMappingEvidence({ target: BRANCH, source_observation: OBSERVATION });
  assert.equal(mapping.mapping_status, "source_verified");
  assert.equal(mapping.branch.pos_id, "109664");
  assert.equal(JSON.stringify(mapping).includes("KDS_FABI_AUTHORIZATION"), false);
  assert.throws(
    () => createSourceMappingEvidence({
      target: BRANCH,
      source_observation: { ...OBSERVATION, pos_id: "109665" }
    }),
    /KDS_MAPPING_BRANCH_MISMATCH/
  );
});

test("P8 rejects missing invoices, extra invoices, item failures, unverified modifiers, or incomplete recovery", () => {
  assert.equal(reconciliation().status, "pass");
  for (const snapshot of [
    { missing_invoice_count: 1, projected_invoice_count: 2 },
    { extra_invoice_count: 1, projected_invoice_count: 4 },
    { item_fail_count: 1 },
    { modifiers_verified: false },
    { recovery_complete: false },
    { source_snapshot_complete: false }
  ]) {
    assert.equal(reconciliation(snapshot).status, "hold");
  }
});

test("P9 enables read-only release only after exact mapping and all reconciliation gates pass", () => {
  const mapping = createSourceMappingEvidence({ target: BRANCH, source_observation: OBSERVATION });
  const approved = authorizeKdsReadRelease({ branch: BRANCH, mapping, reconciliation: reconciliation() });
  assert.deepEqual(approved, { branch: BRANCH, read_enabled: true, reason: null });
  const held = authorizeKdsReadRelease({ branch: BRANCH, mapping, reconciliation: reconciliation({ item_fail_count: 1 }) });
  assert.equal(held.read_enabled, false);
  assert.equal(held.reason, "KDS_RELEASE_EVIDENCE_INCOMPLETE");
});

test("read router is dormant at construction and blocks loader access until a matching gate is enabled", async () => {
  let ordersCalls = 0;
  let captured;
  const disabled = createKdsReadOnlyOperationsRouterV1({
    authenticate: async () => ({}),
    loadGrants: async () => [],
    loadPolicy: async () => ({}),
    clock: () => 0,
    loadOrders: async () => { ordersCalls++; return []; },
    loadReleaseGate: async () => ({ branch: BRANCH, read_enabled: false }),
    createRouter: deps => { captured = deps; return Object.freeze({}); }
  });
  assert.deepEqual(disabled.router, {});
  assert.equal(ordersCalls, 0);
  await assert.rejects(() => captured.loadOrders({ ...BRANCH }), /KDS_RELEASE_READ_NOT_ENABLED/);
  assert.equal(ordersCalls, 0);

  const enabled = createKdsReadOnlyOperationsRouterV1({
    authenticate: async () => ({}),
    loadGrants: async () => [],
    loadPolicy: async () => ({}),
    clock: () => 0,
    loadOrders: async () => { ordersCalls++; return [{ ...BRANCH }]; },
    loadReleaseGate: async () => ({ branch: BRANCH, read_enabled: true }),
    createRouter: deps => { captured = deps; return Object.freeze({}); }
  });
  assert.deepEqual(enabled.router, {});
  assert.equal((await captured.loadOrders({ ...BRANCH })).length, 1);
  assert.equal(ordersCalls, 1);
});

test("P7-P9 source owns no mount, timer, scheduler, environment, or direct network primitive", () => {
  const root = path.resolve(__dirname, "../../..");
  const files = [
    "services/kds/cingKdsSourceMappingEvidenceV1.js",
    "services/kds/cingKdsReleaseReconciliationV1.js",
    "services/kds/cingKdsReadReleaseGateV1.js",
    "services/kds/cingKdsReadOnlyOperationsCompositionV1.js"
  ];
  const source = files.map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.doesNotMatch(source, /set(?:Interval|Timeout)\s*\(|process\.env|fetch\s*\(|axios|server\.listen|app\.use/);
});

test("P7-P9 migration candidates are exact mirrors, close direct table access, and grant only service-role RPCs", () => {
  const root = path.resolve(__dirname, "../../..");
  const names = [
    "20261021180000_cing_kds_source_mapping_evidence_p7_v1.sql",
    "20261021190000_cing_kds_reconciliation_evidence_p8_v1.sql",
    "20261021200000_cing_kds_read_release_gate_p9_v1.sql"
  ];
  for (const name of names) {
    const db = fs.readFileSync(path.join(root, "db/migrations", name), "utf8");
    const supabase = fs.readFileSync(path.join(root, "supabase/migrations", name), "utf8");
    assert.equal(db, supabase);
    assert.match(db, /enable row level security/i);
    assert.match(db, /revoke all on table[\s\S]*from public,anon,authenticated,service_role/i);
    assert.match(db, /security definer set search_path=public,pg_catalog,pg_temp/i);
    assert.match(db, /grant execute[\s\S]*to service_role/i);
    assert.doesNotMatch(db, /create trigger|pg_cron|http_request|net\.http/i);
  }
  const p9 = fs.readFileSync(path.join(root, "db/migrations", names[2]), "utf8");
  assert.match(p9, /read_enabled=false/);
  assert.match(p9, /KDS_P9_EVIDENCE_INCOMPLETE/);
});
