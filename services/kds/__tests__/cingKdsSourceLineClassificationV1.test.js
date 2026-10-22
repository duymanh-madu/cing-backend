"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyKdsSourceLinesV1: classify } = require("../cingKdsSourceLineClassificationV1");
function line(id, category, type, quantity, name = "") {
  return { canonical_line_id: "LINE-" + id, item_id: id, item_class_id: category,
    item_type_id: type, quantity, item_name: name, unit_id: "MON" };
}
function input(lines) {
  return { store_uid: "STORE-A", state: {
    schema_version: "cing_kds_fabi_c04_state_v1", active_lines: lines,
    active_line_count: lines.length,
    total_quantity: lines.reduce((sum, row) => sum + row.quantity, 0)
  } };
}
const sample = () => input([
  line("DRINKS", "DU", "TCDD", 68), line("FOOD", "DA", "DAV", 17),
  line("ITEM-Y5MT", "TP", "TOPPING", 3, "TRÂN CHÂU ĐEN"),
  line("CUSTOM-EXAMPLE", "ITEM_TYPE_OTHER", "CUSTOMESALE", 1, "ship")
]);
const rule = () => ({ store_uid: "STORE-A", item_id: "CUSTOM-EXAMPLE",
  item_class_id: "ITEM_TYPE_OTHER", item_type_id: "CUSTOMESALE",
  category: "non_preparation", review_reference: "TEST-REVIEW-ONLY" });

test("observed category totals retain all 89 units, custom ship stays review", () => {
  const out = classify(sample());
  assert.deepEqual(out.totals, { beverage_units: 68, food_units: 17, topping_units: 3,
    non_preparation_units: 0, review_units: 1, all_units: 89 });
  assert.equal(out.review_required, true);
  assert.equal(out.physical_cup_count, null);
  assert.equal(out.modifier_attachment_verified, false);
});
test("same MON unit never turns food or topping into beverage units", () => {
  const out = classify(input([line("A", "TP", "TOPPING", 3), line("B", "DA", "DAV", 4)]));
  assert.equal(out.totals.beverage_units, 0);
  assert.equal(out.totals.topping_units, 3);
  assert.equal(out.totals.food_units, 4);
});
test("name changes and any CUSTOMESALE item cannot bypass review", () => {
  for (const name of ["ship", "SHIP", "shipping fee", "Trà sữa", ""]) {
    const out = classify(input([line("CUSTOM", "OTHER", "CUSTOMESALE", 1, name)]));
    assert.equal(out.lines[0].category, "review");
  }
});
test("explicit exact-store item rule classifies without deleting reconciliation line", () => {
  const args = { ...sample(), nonPreparationRules: [rule()] };
  const bytes = JSON.stringify(args);
  const out = classify(args);
  assert.equal(out.totals.non_preparation_units, 1);
  assert.equal(out.totals.all_units, 89);
  assert.equal(out.lines.length, 4);
  assert.equal(out.review_required, false);
  assert.equal(out.source_mapping_verified, false);
  assert.equal(JSON.stringify(args), bytes);
  assert.ok(Object.isFrozen(out.lines[0]));
});
test("foreign scope, changed category, missing review and duplicate rules fail", () => {
  for (const r of [
    { ...rule(), store_uid: "STORE-B" }, { ...rule(), item_class_id: "DU" },
    { ...rule(), item_type_id: "OTHER" }, { ...rule(), review_reference: "" }
  ]) assert.throws(() => classify({ ...sample(), nonPreparationRules: [r] }));
  assert.throws(() => classify({ ...sample(), nonPreparationRules: [rule(), rule()] }));
});
test("unknown category remains visible in review", () => {
  const out = classify(input([line("UNKNOWN", "NEW", "NEW", 2)]));
  assert.equal(out.totals.review_units, 2);
  assert.equal(out.lines.length, 1);
});
test("invalid quantity or duplicate logical line cannot change counts", () => {
  for (const quantity of [0, -1, 1.5, "1", NaN]) {
    assert.throws(() => classify(input([line("A", "DU", "TCDD", quantity)])));
  }
  const row = line("A", "DU", "TCDD", 1);
  assert.throws(() => classify(input([row, row])));
});
test("projection metadata mismatch fails instead of silently dropping lines", () => {
  const args = sample();
  args.state.total_quantity++;
  assert.throws(() => classify(args));
});
