"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { interpretFabiC04ObservedClockV1: clock, normalizeFabiC04ObservedEnvelopeV1: envelope } = require("../cingKdsFabiC04ObservedClockV1");
const { normalizeFabiC04EventV1: normalize } = require("../cingKdsFabiC04EventNormalizerV1");
const { projectFabiC04StateV1: project } = require("../cingKdsFabiC04SignedDeltaReducerV1");

// Reconstructed from the redacted live observations for invoice 230085.
// Transaction, detail, and scope identifiers below are test-only stand-ins.
function line(id, item, name, category, quantity, price) {
  return { id_sale_detail: id, item_id: item, item_name: name,
    item_class_id: category, item_class_name: category === "DU" ? "Đồ uống" : "Đồ ăn",
    item_type_id: category === "DU" ? "TCDD" : "DAV", quantity, price,
    unit_id: "MON", toppings: [], status: "COOKING" };
}
const drink = (id, item, name) => line(id, item, name, "DU", 1, 41000);
const food = () => line("LINE-FOOD", "ITEM-AGGR", "HƯỚNG DƯƠNG THƯỜNG", "DA", 2, 15000);
function record(seconds = 1792679745, formatted = "2026-10-22 14:35:45:901000", lines = [food()]) {
  return { created_at: seconds, updated_at: seconds,
    fmt_created_at: formatted, fmt_updated_at: formatted,
    start_date: 1792654545766, tran_id: "TEST-TRAN-230085", log_type: "SALE_CHANGE",
    change_data: { tran_id: "TEST-TRAN-230085", tran_no: "230085",
      company_uid: "TEST-COMPANY", brand_uid: "TEST-BRAND", store_uid: "TEST-STORE",
      sale_detail: lines } };
}
function sample() {
  return [
    record(1792679745, "2026-10-22 14:35:45:901000", [
      drink("LINE-COCONUT", "ITEM-50VK", "SỮA DỪA NƯỚNG TCDD M"), food(),
      drink("LINE-COCOA", "ITEM-Q5ZI", "CACAO KEM TRỨNG TCDD M"),
      drink("LINE-MILK", "ITEM-S791", "SỮA TƯƠI NƯỚNG TCDD M")]),
    record(1792680035, "2026-10-22 14:40:35:445000", [
      line("LINE-GUAVA", "ITEM-9EM6", "TRÀ ỔI HỒNG CHANH VÀNG", "DU", 1, 40000)]),
    record(1792684079, "2026-10-22 15:47:59:114000", [food()])
  ];
}

test("observed wall clock converts to actual UTC and preserves all microseconds", () => {
  const out = clock(record());
  assert.equal(out.created.utc_iso_microseconds, "2026-10-22T07:35:45.901000Z");
  assert.equal(out.created.epoch_microseconds, "1792654545901000");
  assert.equal(out.source_start_date_ms, 1792654545766);
  assert.equal(out.runtime_checkpoint_authority, false);
});
test("midnight crosses UTC date without changing source date", () => {
  const seconds = Date.parse("2026-10-23T00:00:00Z") / 1000;
  assert.equal(clock(record(seconds, "2026-10-23 00:00:00:000001")).created.utc_iso_microseconds,
    "2026-10-22T17:00:00.000001Z");
});
test("invalid dates, missing pairs and convention drift fail closed", () => {
  for (const patch of [
    { fmt_created_at: "2026-02-30 14:35:45:901000" },
    { fmt_created_at: "2026-10-22 24:00:00:000000" },
    { fmt_created_at: "2026-10-22 14:35:45" },
    { created_at: 1792679745 - 25200 }, { created_at: "1792679745" },
    { fmt_updated_at: undefined }, { start_date: NaN }
  ]) assert.throws(() => clock({ ...record(), ...patch }), /C04_CLOCK_REVIEW_REQUIRED/);
});
test("updated cannot precede created, including submillisecond precision", () => {
  assert.throws(() => clock({ ...record(), fmt_updated_at: "2026-10-22 14:35:45:900999" }), /REVIEW_REQUIRED/);
});
test("same second retains microsecond ordering", () => {
  const a = clock(record()).created;
  const b = clock(record(1792679745, "2026-10-22 14:35:45:901001")).created;
  assert.ok(BigInt(a.epoch_microseconds) < BigInt(b.epoch_microseconds));
});
test("envelope preserves exact V1 event, fingerprint and source bytes", () => {
  const input = record();
  const bytes = JSON.stringify(input);
  assert.deepEqual(envelope(input).event, normalize(input));
  assert.equal(JSON.stringify(input), bytes);
  assert.ok(Object.isFrozen(envelope(input).clock.created));
});
test("invoice sample matches every item and quantity; replay does not add units", () => {
  const events = sample().map(row => envelope(row).event);
  const state = project([...events].reverse().concat(events[0]));
  assert.equal(state.unique_event_count, 3);
  assert.equal(state.replayed_event_count, 1);
  assert.equal(state.total_quantity, 8);
  assert.deepEqual(Object.fromEntries(state.active_lines.map(row => [row.item_id, row.quantity])), {
    "ITEM-Q5ZI": 1, "ITEM-50VK": 1, "ITEM-AGGR": 4, "ITEM-9EM6": 1, "ITEM-S791": 1
  });
  assert.equal(state.active_lines.filter(row => row.item_class_id === "DU").reduce((n, row) => n + row.quantity, 0), 4);
  assert.equal(state.active_lines.filter(row => row.item_class_id === "DA").reduce((n, row) => n + row.quantity, 0), 4);
  assert.equal(state.active_lines.reduce((n, row) => n + row.price * row.quantity, 0), 223000);
  assert.equal(state.semantics.payment_authority, false);
  assert.equal(state.semantics.final_state_authority, false);
});
