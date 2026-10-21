"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  compareExactInvoices
} = require("../cingKdsP7P8SourceCollectorContractV1");

const {
  createKdsP7P8SourceCollectorV1
} = require("../cingKdsP7P8SourceCollectorCompositionV1");

const BRANCH = Object.freeze({ pos_parent: "BRAND-DQIR", pos_id: "109664" });

function snapshot(overrides = {}) {
  return {
    ...BRANCH,
    complete: true,
    invoices: [{
      invoice_key: "invoice-1",
      lines: [{
        line_key: "line-1",
        item_id: "drink-1",
        variant_id: "large",
        quantity: 2,
        modifiers: [{ modifier_id: "sugar-50", quantity: 1 }]
      }]
    }],
    ...overrides
  };
}

test("exact invoice, line, variant, modifier, and cup quantity parity passes", () => {
  const result = compareExactInvoices({
    source_snapshot: snapshot(),
    projected_snapshot: snapshot(),
    recovery_complete: true,
    modifiers_verified: true
  });
  assert.deepEqual(result.branch, BRANCH);
  assert.equal(result.source_invoice_count, 1);
  assert.equal(result.item_pass_count, 1);
  assert.equal(result.item_fail_count, 0);
  assert.equal(result.cup_expected_count, 2);
  assert.equal(result.cup_projected_count, 2);
  assert.match(result.source_snapshot_digest, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes("invoice-1"), false);
  assert.equal(JSON.stringify(result).includes("drink-1"), false);
});

test("missing, extra, changed quantity, variant, or modifier fails exact reconciliation", () => {
  const cases = [
    snapshot({ invoices: [] }),
    snapshot({ invoices: [...snapshot().invoices, { invoice_key: "invoice-2", lines: [] }] }),
    snapshot({ invoices: [{ ...snapshot().invoices[0], lines: [{ ...snapshot().invoices[0].lines[0], quantity: 3 }] }] }),
    snapshot({ invoices: [{ ...snapshot().invoices[0], lines: [{ ...snapshot().invoices[0].lines[0], variant_id: "medium" }] }] }),
    snapshot({ invoices: [{ ...snapshot().invoices[0], lines: [{ ...snapshot().invoices[0].lines[0], modifiers: [{ modifier_id: "sugar-100", quantity: 1 }] }] }] })
  ];
  for (const projected of cases) {
    const result = compareExactInvoices({
      source_snapshot: snapshot(),
      projected_snapshot: projected,
      recovery_complete: true,
      modifiers_verified: true
    });
    assert.ok(result.missing_invoice_count > 0 || result.extra_invoice_count > 0 || result.item_fail_count > 0 || result.cup_expected_count !== result.cup_projected_count);
  }
});

test("composition is dormant and preserves exact branch scope", async () => {
  let calls = 0;
  const collector = createKdsP7P8SourceCollectorV1({
    observeSourceMapping: async ({ target }) => { calls++; return { ...target }; },
    loadSourceSnapshot: async ({ target }) => { calls++; return { ...snapshot(), ...target }; },
    loadProjectedSnapshot: async ({ target }) => { calls++; return { ...snapshot(), ...target }; },
    verifyRecoveryComplete: async () => { calls++; return true; },
    verifyModifiers: async () => { calls++; return true; }
  });
  assert.equal(calls, 0);
  const result = await collector.collect({ target: BRANCH });
  assert.equal(calls, 5);
  assert.deepEqual(result.reconciliation_snapshot.branch, BRANCH);
  await assert.rejects(
    () => collector.collect({ target: { pos_parent: "BRAND-DQIR", pos_id: "109665" } }),
    /KDS_P7P8_TARGET_NOT_APPROVED/
  );
});

test("collector contract owns no environment, HTTP, scheduler, database writer, or route mount", () => {
  const root = path.resolve(__dirname, "../../..");
  const files = [
    "services/kds/cingKdsP7P8SourceCollectorContractV1.js",
    "services/kds/cingKdsP7P8SourceCollectorCompositionV1.js"
  ];
  const source = files.map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.doesNotMatch(source, /process\.env|fetch\s*\(|axios|set(?:Interval|Timeout)\s*\(|\.rpc\s*\(|server\.listen|app\.use/);
});
