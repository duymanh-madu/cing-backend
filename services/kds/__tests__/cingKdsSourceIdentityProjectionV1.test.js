"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { projectKdsSourceIdentityV1 } = require("../cingKdsSourceIdentityProjectionV1");
const { projectFabiC04StateV1 } = require("../cingKdsFabiC04SignedDeltaReducerV1");
const scope = { company_uid:"company-test", brand_uid:"brand-test", store_uid:"store-test" };
const target = { pos_parent:"parent-test", pos_id:"123" };
const catalog = { ...target, store_id:123, items:[
  { store_item_id:"drink-test", customizations:[{ options:[{id:"topping-test"}] }] },
  { store_item_id:"food-test" }
] };
function event(fp, time, qty, toppingQty = qty) {
  return { schema_version:"cing_kds_fabi_c04_event_v1", source_log_type:"SALE_CHANGE",
    tran_id:"transaction-test", tran_no:"invoice-test", event_fingerprint:fp,
    event_created_at:time, source_company_uid:scope.company_uid,
    source_brand_uid:scope.brand_uid, source_store_uid:scope.store_uid,
    semantics:{quantity_model:"signed_delta",payment_authority:false,final_state_authority:false},
    lines:[{canonical_line_id:"line-test",item_id:"drink-test",item_name:"Test drink",
      item_class_id:"DU",item_type_id:"test-type",unit_id:"MON",price:1,note:"",
      quantity_delta:qty,toppings:toppingQty === null ? [] : [{canonical_line_id:"modifier-test",
        item_id:"topping-test",item_name:"Test topping",item_class_id:"TP",unit_id:"MON",
        quantity_delta:toppingQty}]}] };
}
function project(events, extra={}) { return projectKdsSourceIdentityV1({events,scope,target,catalog,...extra}); }

test("add/reversal/replay yields net modifier quantity without altering reducer state or event bytes",()=>{
  const a=event("a",1,3), b=event("b",2,-1);
  const events=[b,a,a]; const before=JSON.stringify(events);
  const result=project(events);
  assert.equal(result.state.total_quantity,2);
  assert.equal(result.modifier_quantity,2);
  assert.equal(result.modifier_lines[0].parent_line_id,"line-test");
  assert.deepEqual(result.state,projectFabiC04StateV1(events));
  assert.equal(JSON.stringify(events),before);
  assert.equal(result.review_required,false);
  assert.equal(result.release_authorized,false);
  assert.equal(result.payment_authority,false);
  assert.equal(result.source_mapping_verified,false);
  assert.equal(result.historical_variant_identity_verified,false);
});
test("full reversal removes parent and modifier, never leaves ghost topping",()=>{
  const result=project([event("a",1,2),event("b",2,-2)]);
  assert.equal(result.modifier_quantity,0); assert.equal(result.state.active_lines.length,0);
});
test("removed parent with unreversed topping fails",()=>{
  assert.throws(()=>project([event("a",1,1),event("b",2,-1,null)]),/removed_line_has_active_modifier/);
});
test("historical absent item is retained and requires review",()=>{
  const a=event("a",1,2,null); a.lines[0].item_id="historical-test";a.lines[0].item_class_id="DA";
  const r=project([a]); assert.equal(r.state.total_quantity,2);
  assert.equal(r.classification.totals.food_units,2); assert.equal(r.review_required,true);
  assert.equal(r.reviews[0].reason,"item_absent_from_current_catalog");
});
test("custom sale remains visible, never becomes automatically excluded fee",()=>{
  const a=event("a",1,1,null);a.lines[0].item_id="CUSTOMESALE-test";a.lines[0].item_class_id="ITEM_TYPE_OTHER";
  const r=project([a]);assert.equal(r.classification.totals.review_units,1);assert.equal(r.state.total_quantity,1);
});
test("option allowed for another parent is review, not accepted by global option match",()=>{
  const a=event("a",1,1);a.lines[0].item_id="food-test";
  const r=project([a]);assert.equal(r.review_required,true);
  assert.equal(r.reviews[0].reason,"modifier_not_in_parent_catalog");
  assert.equal(r.modifier_quantity,1);
});
test("foreign event scope and foreign catalog fail",()=>{
  const a=event("a",1,1);a.source_store_uid="foreign";
  assert.throws(()=>project([a]),/event_scope/);
  assert.throws(()=>project([event("a",1,1)],{catalog:{...catalog,store_id:999}}),/catalog_scope/);
});
test("fractional line or modifier delta fails before projection",()=>{
  assert.throws(()=>project([event("a",1,0.5)]),/line_quantity/);
  assert.throws(()=>project([event("a",1,1,0.5)]),/modifier_quantity/);
});
test("same fingerprint with changed payload fails instead of silently dropping conflict",()=>{
  assert.throws(()=>project([event("a",1,1),event("a",1,2)]),/replay_conflict/);
});
test("modifier identity cannot silently move to another parent",()=>{
  const a=event("a",1,1),b=event("b",2,1);b.lines[0].canonical_line_id="different-parent";
  assert.throws(()=>project([a,b]),/modifier_parent_changed/);
});
test("duplicate per-event modifier or menu item fails",()=>{
  const a=event("a",1,1);a.lines[0].toppings.push({...a.lines[0].toppings[0]});
  assert.throws(()=>project([a]),/duplicate_event_modifier/);
  assert.throws(()=>project([event("a",1,1)],{catalog:{...catalog,items:[...catalog.items,catalog.items[0]]}}),/duplicate_menu_item/);
});
test("negative final quantity and changed modifier identity fail",()=>{
  assert.throws(()=>project([event("a",1,-1)]),/final_negative/);
  const b=event("b",2,1);b.lines[0].toppings[0].item_id="changed-test";
  assert.throws(()=>project([event("a",1,1),b]),/modifier_identity_changed/);
});
test("explicit event clock is forwarded and retains submillisecond ordering",()=>{
  const a=event("a",1,2),b=event("b",1,-1);
  const eventClock=e=>({epoch_microseconds:e.event_fingerprint==="a"?"1000001":"1000002"});
  const r=project([b,a],{eventClock});
  assert.deepEqual(r.state,projectFabiC04StateV1([b,a],{eventClock}));
  assert.equal(r.modifier_quantity,1);
});
