"use strict";

const { projectFabiC04StateV1 } = require("./cingKdsFabiC04SignedDeltaReducerV1");
const { classifyKdsSourceLinesV1 } = require("./cingKdsSourceLineClassificationV1");

function fail(reason) {
  const error = new Error(`KDS_SOURCE_IDENTITY_INVALID:${reason}`);
  error.code = "KDS_SOURCE_IDENTITY_INVALID";
  throw error;
}
function text(value) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) fail("string");
  return value;
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

// Read-only composition over the existing reducer. Catalog absence requires
// review and never deletes historical lines. Catalog is an observation, not
// proof of branch mapping, payment, historical variants or physical cup counts.
function projectKdsSourceIdentityV1({ events, scope, target, catalog,
  eventClock = null, nonPreparationRules = [] } = {}) {
  for (const key of ["company_uid", "brand_uid", "store_uid"]) text(scope?.[key]);
  text(target?.pos_parent);
  const posId = String(target?.pos_id ?? "");
  if (!posId || catalog?.pos_parent !== target.pos_parent ||
      String(catalog?.pos_id ?? "") !== posId ||
      String(catalog?.store_id ?? "") !== posId || !Array.isArray(catalog?.items)) fail("catalog_scope");
  if (!Array.isArray(events) || !events.length) fail("events");
  const menu = new Map();
  for (const item of catalog.items) {
    const id = text(item?.store_item_id);
    if (menu.has(id)) fail("duplicate_menu_item");
    const options = new Set();
    if (item.customizations != null && !Array.isArray(item.customizations)) fail("customizations");
    for (const group of item.customizations || []) {
      if (!Array.isArray(group?.options)) fail("options");
      for (const option of group.options) options.add(text(option?.id));
    }
    menu.set(id, options);
  }
  const reviews = new Map();
  function review(reason, itemId, modifierId = null) {
    const value = { reason, item_id: itemId, modifier_item_id: modifierId };
    reviews.set(JSON.stringify(value), value);
  }
  const fingerprints = new Map();
  const modifierOwners = new Map();
  for (const event of events) {
    for (const key of ["company_uid", "brand_uid", "store_uid"]) {
      if (event?.[`source_${key}`] !== scope[key]) fail("event_scope");
    }
    const fp = text(event.event_fingerprint);
    const bytes = JSON.stringify(event);
    if (fingerprints.has(fp) && fingerprints.get(fp) !== bytes) fail("replay_conflict");
    fingerprints.set(fp, bytes);
    if (!Array.isArray(event.lines)) fail("lines");
    const lineIds = new Set();
    for (const line of event.lines) {
      const lineId = text(line?.canonical_line_id);
      const itemId = text(line.item_id);
      if (lineIds.has(lineId)) fail("duplicate_event_line");
      lineIds.add(lineId);
      if (!Number.isSafeInteger(line.quantity_delta) || line.quantity_delta === 0) fail("line_quantity");
      if (!menu.has(itemId)) review("item_absent_from_current_catalog", itemId);
      if (!Array.isArray(line.toppings)) fail("toppings");
      const seen = new Set();
      for (const modifier of line.toppings) {
        const id = text(modifier?.canonical_line_id);
        const modifierItem = text(modifier.item_id);
        if (seen.has(id)) fail("duplicate_event_modifier");
        seen.add(id);
        if (!Number.isSafeInteger(modifier.quantity_delta) || modifier.quantity_delta === 0) fail("modifier_quantity");
        if (modifierOwners.has(id) && modifierOwners.get(id) !== lineId) fail("modifier_parent_changed");
        modifierOwners.set(id, lineId);
        if (modifier.sub_topping != null &&
            (!Array.isArray(modifier.sub_topping) || modifier.sub_topping.length)) fail("nested_modifier_unsupported");
        if (!menu.get(itemId)?.has(modifierItem)) review("modifier_not_in_parent_catalog", itemId, modifierItem);
      }
    }
  }
  const state = projectFabiC04StateV1(events, { eventClock });
  const classification = classifyKdsSourceLinesV1({ state, store_uid: scope.store_uid, nonPreparationRules });
  let modifierQuantity = 0;
  const modifierLines = [];
  for (const line of state.active_lines) {
    for (const modifier of line.modifiers) {
      if (!Number.isSafeInteger(modifier.quantity) || modifier.quantity < 1) fail("final_modifier_quantity");
      modifierQuantity += modifier.quantity;
      if (!Number.isSafeInteger(modifierQuantity)) fail("modifier_total_overflow");
      modifierLines.push({ parent_line_id: line.canonical_line_id,
        parent_item_id: line.item_id, modifier_line_id: modifier.canonical_line_id,
        modifier_item_id: modifier.item_id, quantity: modifier.quantity });
    }
  }
  return freeze({ state, classification, modifier_lines: modifierLines,
    modifier_quantity: modifierQuantity, reviews: [...reviews.values()],
    review_required: reviews.size > 0 || classification.review_required,
    catalog_comparison_only: true, source_mapping_verified: false,
    historical_variant_identity_verified: false, payment_authority: false,
    physical_cup_count: null, release_authorized: false });
}

module.exports = { projectKdsSourceIdentityV1 };
