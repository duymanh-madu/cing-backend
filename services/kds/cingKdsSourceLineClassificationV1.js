"use strict";

function fail() {
  const error = new Error("KDS_SOURCE_LINE_CLASSIFICATION_INVALID");
  error.code = "KDS_SOURCE_LINE_CLASSIFICATION_INVALID";
  throw error;
}
function text(value) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) fail();
  return value;
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

// Server-side, dependency-injected policy only. A rule is an explicit reviewed
// configuration, not a proof of source mapping. Never pass browser input here.
// No automatic name matching, CUSTOMESALE exclusion, or per-cup inference.
function classifyKdsSourceLinesV1({ state, store_uid, nonPreparationRules = [] } = {}) {
  const store = text(store_uid);
  if (state?.schema_version !== "cing_kds_fabi_c04_state_v1" ||
      !Array.isArray(state.active_lines) || !Array.isArray(nonPreparationRules)) fail();
  const rules = new Map();
  for (const rule of nonPreparationRules) {
    if (!rule || rule.store_uid !== store || rule.category !== "non_preparation") fail();
    const id = text(rule.item_id);
    text(rule.item_class_id);
    text(rule.item_type_id);
    text(rule.review_reference);
    if (rules.has(id)) fail();
    rules.set(id, { ...rule });
  }

  const seen = new Set();
  const totals = { beverage_units: 0, food_units: 0, topping_units: 0,
    non_preparation_units: 0, review_units: 0, all_units: 0 };
  const lines = state.active_lines.map(line => {
    if (!line || typeof line !== "object") fail();
    const lineId = text(line.canonical_line_id);
    const itemId = text(line.item_id);
    const classId = text(line.item_class_id);
    const typeId = text(line.item_type_id);
    const quantity = line.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || seen.has(lineId)) fail();
    seen.add(lineId);
    const rule = rules.get(itemId);
    if (rule && (rule.item_class_id !== classId || rule.item_type_id !== typeId)) fail();
    // Known class signals describe units, not physical containers or modifiers.
    const category = rule ? "non_preparation" :
      classId === "DU" ? "beverage" :
      classId === "DA" ? "food" :
      classId === "TP" ? "topping" : "review";
    const totalKey = {
      beverage: "beverage_units", food: "food_units", topping: "topping_units",
      non_preparation: "non_preparation_units", review: "review_units"
    }[category];
    totals[totalKey] += quantity;
    totals.all_units += quantity;
    if (!Number.isSafeInteger(totals[totalKey]) || !Number.isSafeInteger(totals.all_units)) fail();
    return { canonical_line_id: lineId, item_id: itemId,
      item_class_id: classId, item_type_id: typeId, quantity, category,
      review_reference: rule ? rule.review_reference : null };
  });
  if (state.active_line_count !== lines.length || state.total_quantity !== totals.all_units) fail();
  return deepFreeze({
    schema_version: "cing_kds_source_line_classification_v1", store_uid: store,
    lines, totals, review_required: totals.review_units > 0,
    physical_cup_count: null, cup_identity_verified: false,
    modifier_attachment_verified: false, payment_authority: false,
    source_mapping_verified: false
  });
}

module.exports = { classifyKdsSourceLinesV1 };
