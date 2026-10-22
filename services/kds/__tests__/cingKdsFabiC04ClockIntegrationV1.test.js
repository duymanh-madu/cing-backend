"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { OBSERVED_TIME_CONVENTION: mode, resolveFabiC04TimePolicyV1: policy } = require("../cingKdsFabiC04ObservedTimePolicyV1");
const { normalizeFabiC04EventV1: normalize } = require("../cingKdsFabiC04EventNormalizerV1");
const { projectFabiC04StateV1: legacyProject } = require("../cingKdsFabiC04SignedDeltaReducerV1");
const { createFabiC03RecoveryWindowProviderV1: recovery } = require("../cingKdsFabiC03RecoveryWindowProviderV1");
const { createFabiC03HistoricalWindowProviderV1: historical } = require("../cingKdsFabiC03HistoricalWindowProviderV1");
const { createFabiKdsRetryTransactionV1: retry, createFabiKdsDormantRuntimeCompositionV1: runtime } = require("../cingKdsFabiDormantRuntimeCompositionV1");

const scope = { company_uid: "COMPANY", brand_uid: "BRAND", store_uid: "STORE" };
const now = Date.parse("2026-10-23T08:00:00+07:00");
function row({ fraction = "901000", quantity = 1, stamp = "2026-10-22 14:35:45" } = {}) {
  const seconds = Date.parse(stamp.replace(" ", "T") + "Z") / 1000;
  return { created_at: seconds, updated_at: seconds, fmt_created_at: `${stamp}:${fraction}`,
    fmt_updated_at: `${stamp}:${fraction}`, start_date: 1792654545766,
    tran_id: "TRAN", log_type: "SALE_CHANGE", change_data: {
      ...scope, tran_id: "TRAN", tran_no: "230085", sale_detail: [{
        id_sale_detail: "LINE", item_id: "ITEM", item_name: "DRINK",
        item_class_id: "DU", item_type_id: "TCDD", quantity, price: 41000,
        unit_id: "MON", toppings: []
      }]
    } };
}

test("default is byte-equivalent legacy policy; invalid mode is rejected", () => {
  const event = normalize(row());
  assert.deepEqual(policy().normalizeEvent(row()), event);
  assert.deepEqual(policy().projectState([event]), legacyProject([event]));
  assert.throws(() => policy("auto"), /TIME_CONVENTION_INVALID/);
});
test("corrected projection changes only state interpretation, never durable event bytes", () => {
  const p = policy(mode);
  const event = p.normalizeEvent(row());
  const bytes = JSON.stringify(event);
  const out = p.projectState([event]);
  assert.equal(out.first_event_created_at, 1792654545901);
  assert.equal(out.last_event_created_at, 1792654545901);
  assert.notEqual(out.state_fingerprint, legacyProject([event]).state_fingerprint);
  assert.equal(JSON.stringify(event), bytes);
  assert.deepEqual(event, normalize(row()));
  assert.match(out.event_time_basis, /^utc_epoch_milliseconds/);
});
test("submillisecond add then reversal sorts correctly regardless of input/fingerprint", () => {
  const add = normalize(row({ fraction: "000001", quantity: 1 }));
  const remove = normalize(row({ fraction: "000002", quantity: -1 }));
  const out = policy(mode).projectState([remove, add, add]);
  assert.equal(out.total_quantity, 0);
  assert.equal(out.replayed_event_count, 1);
  assert.equal(out.first_event_created_at, 1792654545000);
  assert.equal(out.last_event_created_at, 1792654545001);
});
test("durable histories lacking or contradicting formatted time hold", () => {
  const event = normalize(row());
  for (const patch of [{ event_time_iso: null }, { event_created_at: event.event_created_at - 25200 }]) {
    assert.throws(() => policy(mode).projectState([{ ...event, ...patch }]), /CLOCK_REVIEW_REQUIRED/);
  }
});
test("C03 overnight recovery uses epoch-ms bounds from durable history through now", async () => {
  const state = policy(mode).projectState([normalize(row())]);
  const window = await historical({ windowProvider: recovery({ nowProvider: async () => now }) })({
    tran_id: "TRAN", tran_no: "230085", ...state
  });
  assert.equal(window.startDate, 1792654545901);
  assert.equal(window.endDate, now);
  assert.ok(window.startDate < Date.parse("2026-10-22T16:14:53+07:00"));
});
test("retry uses identical clock policy and holds old queue fingerprints before C03", async () => {
  const events = [normalize(row())];
  let calls = 0;
  const run = retry({ loadDurableEvents: async () => events, projectState: policy(mode).projectState,
    reconcileWithC03: async ({ state }) => {
      calls++;
      assert.equal(state.first_event_created_at, 1792654545901);
      return { authority: "c03_paid_final", matched: true };
    } });
  await assert.rejects(run({ scope, tran_id: "TRAN", state_fingerprint: legacyProject(events).state_fingerprint }), /STATE_CHANGED/);
  assert.equal(calls, 0);
  const result = await run({ scope, tran_id: "TRAN", state_fingerprint: policy(mode).projectState(events).state_fingerprint });
  assert.equal(result.status, "ready");
  assert.equal(calls, 1);
});

function harness({ invalid = false, claims = [] } = {}) {
  const input = invalid ? { ...row(), fmt_created_at: "invalid" } : row();
  const events = [];
  const queries = [];
  const commits = [];
  const queued = [];
  let writes = 0;
  const runner = runtime({
    c04TimeConvention: mode,
    scopeProvider: async () => scope,
    nowProvider: async () => now,
    c03EligibilityProvider: async () => ({ eligible: true, retry_delay_seconds: null }),
    c04HttpClient: { getSaleChangeLog: async args => {
      queries.push({ kind: "C04", ...args });
      return { page: args.page, rows: args.page === 1 ? [input] : [] };
    } },
    c03HttpClient: { getSaleDetail: async args => {
      queries.push({ kind: "C03", ...args });
      return { source: "fabi_c03_sale_by_date_csv", expanded: true, data: [] };
    } },
    durableDbAdapter: {
      invokeRpc: async args => {
        writes++;
        events.push(normalize(input));
        return { result: "inserted", inbox_id: 1, observation_count: 1 };
      },
      loadDurableEvents: async () => events.length ? events : [normalize(row())]
    },
    runtimeLeaseAdapter: {
      acquire: async () => ({ acquired: true, lease_token: "LEASE", lease_expires_at: "future", checkpoint_end_ms: now - 60000 }),
      renew: async () => ({ renewed: true, lease_expires_at: "future" }),
      release: async () => ({ released: true }),
      commit: async args => { commits.push(args); return { committed: true, checkpoint_end_ms: args.checkpoint_end_ms }; }
    },
    reconciliationQueueAdapter: {
      claimDue: async () => claims,
      resolveClaim: async () => ({ status: "pending_c03", result_version: 2, attempt_count: 1, next_reconcile_at: "future" }),
      putResult: async args => {
        queued.push(args);
        return { status: args.status, result_version: 1, attempt_count: 0, next_reconcile_at: "future" };
      }
    }
  });
  return { runner, queries, commits, queued, writes: () => writes };
}

test("dormant root poll and C03 share corrected clock, checkpoint remains epoch ms", async () => {
  const h = harness();
  assert.equal(h.queries.length, 0);
  const result = await h.runner.runOnce();
  assert.equal(result.status, "committed");
  const c03 = h.queries.find(q => q.kind === "C03");
  assert.equal(c03.companyUid, scope.company_uid);
  assert.equal(c03.brandUid, scope.brand_uid);
  assert.equal(c03.storeUid, scope.store_uid);
  assert.equal(c03.startDate, 1792654545901);
  assert.equal(c03.endDate, now);
  const c04 = h.queries.find(q => q.kind === "C04");
  assert.equal(c04.start_date, now - 120000);
  assert.equal(c04.end_date, now - 5000);
  assert.equal(h.commits[0].checkpoint_end_ms, now - 5000);
  assert.equal(h.queued.length, 1);
});
test("clock validation failure prevents persistence and checkpoint advance", async () => {
  const h = harness({ invalid: true });
  await assert.rejects(h.runner.runOnce());
  assert.equal(h.writes(), 0);
  assert.equal(h.commits.length, 0);
  assert.equal(h.queries.filter(q => q.kind === "C03").length, 0);
});

test("root retry reloads the same normalized history with corrected C03 scope and time", async () => {
  const fingerprint = policy(mode).projectState([normalize(row())]).state_fingerprint;
  const h = harness({ claims: [{ tran_id: "TRAN", state_fingerprint: fingerprint,
    claim_token: "CLAIM", result_version: 1, attempt_count: 1 }] });
  const result = await h.runner.runOnce();
  assert.equal(result.retries_claimed, 1);
  assert.equal(result.retries_resolved, 1);
  const calls = h.queries.filter(q => q.kind === "C03");
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.startDate, 1792654545901);
    assert.equal(call.endDate, now);
    assert.equal(call.companyUid, scope.company_uid);
    assert.equal(call.brandUid, scope.brand_uid);
    assert.equal(call.storeUid, scope.store_uid);
  }
});

test("stale legacy queue claim blocks root checkpoint instead of silently migrating evidence", async () => {
  const fingerprint = legacyProject([normalize(row())]).state_fingerprint;
  const h = harness({ claims: [{ tran_id: "TRAN", state_fingerprint: fingerprint,
    claim_token: "CLAIM", result_version: 1, attempt_count: 1 }] });
  await assert.rejects(h.runner.runOnce(), /STATE_CHANGED/);
  assert.equal(h.commits.length, 0);
});
