"use strict";
const crypto = require("node:crypto");
const {resolveFabiC04TimePolicyV1, OBSERVED_TIME_CONVENTION} = require("./cingKdsFabiC04ObservedTimePolicyV1");
const {classifyC04LogTypeV1} = require("./cingKdsC04LogClassificationV1");
const POLICY = "c03_report_membership_paid_v1";
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function text(v) { if(typeof v!=="string" || !v.trim() || v!==v.trim() || v.length>1000) fail("KDS_PAID_TEXT_INVALID"); return v; }
function qty(v) { if(!Number.isSafeInteger(v) || v<1 || v>1000) fail("KDS_PAID_QUANTITY_INVALID"); return v; }
function money(v) { if(typeof v!=="number" || !Number.isFinite(v) || v<0) fail("KDS_PAID_PRICE_INVALID"); return v; }
function unit(v) { if(v==null || v==="") return null; return text(v); }
function signature(line, modifiers) {
  return JSON.stringify([text(line.item_name),money(line.price),unit(line.unit_id),modifiers]);
}
function modifierSignature(modifier) {
  return JSON.stringify([text(modifier.item_name),unit(modifier.unit_id),String(modifier.item_id || "")]);
}
function sum(map,key,n) { const out=(map.get(key)||0)+qty(n); if(!Number.isSafeInteger(out))fail("KDS_PAID_QUANTITY_INVALID");map.set(key,out); }
function parents(lines) {
  const out=new Map();
  for(const line of lines) sum(out,signature(line,null),line.quantity);
  return JSON.stringify([...out].sort(([a],[b])=>a.localeCompare(b)));
}
function modifiers(lines, key) {
  const out=new Map();
  for(const line of lines) {
    if(!Array.isArray(line[key])) fail("KDS_PAID_MODIFIERS_INVALID");
    for(const mod of line[key]) {
      // Compare parent and exact modifier identity/quantity. These are line totals,
      // never multiply by parent quantity or fabricate allocation to individual cups.
      const sig=JSON.stringify([signature(line,null),modifierSignature(mod)]);
      sum(out,sig,mod.quantity);
    }
  }
  return JSON.stringify([...out].sort(([a],[b])=>a.localeCompare(b)));
}
function stableHash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

// Payment policy is explicitly approved by the shop operator: membership of the
// authenticated C03 report is paid authority. No event name/payment-method heuristic.
// C03 is required for EACH admitted transaction; C04 alone can never create work.
function projectC03PaidOrdersV1({sales,logs,scope,branch,knownTransactions=[]}={}) {
  if(!Array.isArray(sales)||!Array.isArray(logs)||!Array.isArray(knownTransactions)) fail("KDS_PAID_INPUT_INVALID");
  for(const key of ["company_uid","brand_uid","store_uid"]) text(scope?.[key]);
  text(branch?.pos_parent); const pos=String(branch?.pos_id||"");
  if(!/^[1-9][0-9]*$/.test(pos)) fail("KDS_PAID_BRANCH_INVALID");
  const known=new Set(knownTransactions.map(text)), invoices=new Map(), groups=new Map();
  for(const sale of sales) {
    const id=text(sale?.tran_id);
    if(sale.store_uid!==scope.store_uid) fail("KDS_PAID_STORE_MISMATCH");
    if(invoices.has(id)) fail("KDS_PAID_DUPLICATE_INVOICE");
    invoices.set(id,sale);
  }
  const time=resolveFabiC04TimePolicyV1(OBSERVED_TIME_CONVENTION);
  for(const raw of logs) {
    const id=raw?.tran_id || raw?.change_data?.tran_id;
    if(!invoices.has(id)||known.has(id))continue;
    const kind=classifyC04LogTypeV1(raw.log_type);
    if(kind==="print_observation")continue;
    if(kind!=="signed_delta_candidate")fail("KDS_PAID_UNKNOWN_LOG_TYPE");
    const event=time.normalizeEvent(raw);
    for(const key of ["company_uid","brand_uid","store_uid"]) if(event[`source_${key}`]!==scope[key])fail("KDS_PAID_SCOPE_MISMATCH");
    if(!groups.has(id))groups.set(id,[]);
    groups.get(id).push(event);
  }
  const typeNames=new Map();
  for(const events of groups.values())for(const event of events)for(const line of event.lines) {
    const key=JSON.stringify([line.item_class_id,line.item_type_id]);
    if(!typeNames.has(key))typeNames.set(key,new Set());
    if(typeof line.item_type_name==="string"&&line.item_type_name.trim())typeNames.get(key).add(line.item_type_name.trim());
  }
  const orders=[];
  for(const [id,sale] of invoices) {
    // First admitted paid snapshot is immutable. Post-payment changes/refunds are
    // deliberately outside this release, per operator policy. Never reset work.
    if(known.has(id))continue;
    if(!Array.isArray(sale.sale_detail)||!sale.sale_detail.length)fail("KDS_PAID_C03_DETAILS_REQUIRED");
    if(!groups.has(id))fail("KDS_PAID_C04_HISTORY_MISSING");
    const state=time.projectState(groups.get(id));
    if(parents(sale.sale_detail)!==parents(state.active_lines))fail("KDS_PAID_PARENT_PARITY_MISMATCH");
    if(modifiers(sale.sale_detail,"toppings")!==modifiers(state.active_lines,"modifiers"))fail("KDS_PAID_MODIFIER_PARITY_MISMATCH");
    if(!Number.isSafeInteger(sale.tran_date)||sale.tran_date<946684800000||!Number.isFinite(new Date(sale.tran_date).getTime()))fail("KDS_PAID_REPORT_TIME_INVALID");
    const cups=[], lines=[];
    for(const line of state.active_lines) {
      const count=qty(line.quantity), lineId=text(line.canonical_line_id);
      const item=text(line.item_id), name=text(line.item_name);
      const note=typeof line.note==="string"?line.note:"";
      if(note.length>1000)fail("KDS_PAID_NOTE_LIMIT");
      const attached=line.modifiers.map(m=>({item_id:text(m.item_id),item_name:text(m.item_name),quantity:qty(m.quantity),unit_id:unit(m.unit_id)}));
      const category = line.item_class_id==="DU" ? "Đồ uống" : line.item_class_id==="DA" ? "Đồ ăn" : line.item_class_id==="TP" ? "Topping rời" : "Món khác — cần kiểm tra";
      // Existing UI consumes item_name. Explicit line-level labels keep modifiers
      // visible without claiming which physical cup received which modifier.
      const names=typeNames.get(JSON.stringify([line.item_class_id,line.item_type_id]));
      const group=category+" / "+(names?.size===1?[...names][0]:text(line.item_type_id));
      const display=name+(note?` — ${note}`:"")+(attached.length?` · Topping TOÀN DÒNG (${count} phần): ${attached.map(m=>`${m.item_name} ×${m.quantity}`).join(", ")}`:"");
      if(display.length>4000)fail("KDS_PAID_DISPLAY_LIMIT");
      lines.push({line_id:lineId,item_id:item,item_name:name,quantity:count,modifiers:attached,note});
      for(let index=0;index<count;index++) cups.push({unit_key:JSON.stringify([lineId,index]),item_id:item,item_name:display,item_group:group});
    }
    if(cups.length<1||cups.length>1000)fail("KDS_PAID_ORDER_LIMIT");
    const table=typeof sale.table_name==="string"?sale.table_name:"";
    if(table.length>500)fail("KDS_PAID_TABLE_LIMIT");
    const sanitized={policy:POLICY,pos_parent:branch.pos_parent,pos_id:pos,store_uid:scope.store_uid,
      tran_id:id,tran_no:text(String(sale.tran_no||"")),pos_name:typeof sale.store?.store_name==="string"?sale.store.store_name:"",table_name:table,
      source_event_fingerprints:[...new Set(groups.get(id).map(e=>e.event_fingerprint))].sort(),
      paid_reported_at_ms:sale.tran_date,source_line_count:lines.length,total_units:cups.length,lines,cups};
    // No customer, membership, payment trace or credential fields are persisted.
    orders.push({...sanitized,content_hash:stableHash(sanitized)});
  }
  return {policy:POLICY,orders,source_invoice_count:invoices.size,known_invoice_count:[...invoices.keys()].filter(id=>known.has(id)).length,
    created_unit_count:orders.reduce((n,o)=>n+o.cups.length,0)};
}
module.exports={POLICY,projectC03PaidOrdersV1};
