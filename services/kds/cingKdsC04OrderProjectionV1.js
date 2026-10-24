"use strict";
const crypto = require("node:crypto");
const {resolveFabiC04TimePolicyV1,OBSERVED_TIME_CONVENTION}=require("./cingKdsFabiC04ObservedTimePolicyV1");
const {interpretFabiC04NormalizedClockV1}=require("./cingKdsFabiC04ObservedClockV1");
const {classifyC04LogTypeV1}=require("./cingKdsC04LogClassificationV1");
const {projectC03PaidOrdersV1}=require("./cingKdsC03PaidProjectionV1");
const POLICY="c04_order_intake_v1";
function fail(code){throw Object.assign(new Error(code),{code});}
function text(value){if(typeof value!=="string"||!value.trim()||value!==value.trim()||value.length>1000)fail("KDS_PAID_LIVE_TEXT_INVALID");return value;}
function hash(value){return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");}
function projectC04OrdersV1({sales,logs,scope,branch,knownTransactions=[],deadlineAt=Infinity}={}){
 if(!Array.isArray(sales)||!Array.isArray(logs)||!Array.isArray(knownTransactions))fail("KDS_PAID_LIVE_INPUT_INVALID");
 for(const key of ["company_uid","brand_uid","store_uid"])text(scope?.[key]);
 text(branch?.pos_parent);if(!/^[1-9][0-9]*$/.test(String(branch?.pos_id||"")))fail("KDS_PAID_BRANCH_INVALID");
 const checkDeadline=()=>{if(Date.now()>=deadlineAt)fail("KDS_PAID_DEADLINE");};checkDeadline();
 const known=new Set(knownTransactions.map(text)),invoices=new Map(),groups=new Map();
 for(const sale of sales){const id=text(sale?.tran_id);if(sale.store_uid!==scope.store_uid)fail("KDS_PAID_STORE_MISMATCH");if(invoices.has(id))fail("KDS_PAID_DUPLICATE_INVOICE");invoices.set(id,sale);}
 const time=resolveFabiC04TimePolicyV1(OBSERVED_TIME_CONVENTION);
 for(const raw of logs){checkDeadline();
  const id=text(raw?.tran_id||raw?.change_data?.tran_id);if(known.has(id))continue;
  const kind=classifyC04LogTypeV1(raw.log_type);if(kind==="print_observation")continue;
  if(kind!=="signed_delta_candidate")fail("KDS_PAID_UNKNOWN_LOG_TYPE");
  const event=time.normalizeEvent(raw);
  if(event.tran_id && event.tran_id!==id)fail("KDS_PAID_LIVE_IDENTITY_CONFLICT");
  if(raw.change_data?.tran_id && raw.change_data.tran_id!==id)fail("KDS_PAID_LIVE_IDENTITY_CONFLICT");
  for(const key of ["company_uid","brand_uid","store_uid"])if(event[`source_${key}`]!==scope[key])fail("KDS_PAID_SCOPE_MISMATCH");
  if(!groups.has(id))groups.set(id,new Map());
  const entries=groups.get(id),fp=event.event_fingerprint;
  if(entries.has(fp)&&JSON.stringify(entries.get(fp).event)!==JSON.stringify(event))fail("KDS_PAID_LIVE_EVENT_CONFLICT");
  entries.set(fp,{event,table:typeof raw.change_data?.table_name==="string"?raw.change_data.table_name:typeof raw.table_name==="string"?raw.table_name:"",number:String(raw.change_data?.tran_no||"")});
 }
 // C03 is used solely to confirm payment with existing exact parent/modifier parity.
 // It is never an admission prerequisite for C04 orders.
 for(const [id] of invoices)if(!known.has(id)&&!groups.has(id))fail("KDS_PAID_C04_HISTORY_MISSING");
 const paid=projectC03PaidOrdersV1({sales:sales.filter(s=>!known.has(s.tran_id)),logs,scope,branch,knownTransactions:[]});
 const verified=new Map(paid.orders.map(o=>[o.tran_id,o]));
 const orders=[];
 for(const [id,entries] of groups){
  const ordered=[...entries.values()].sort((a,b)=>{
   const x=BigInt(interpretFabiC04NormalizedClockV1(a.event).epoch_microseconds),y=BigInt(interpretFabiC04NormalizedClockV1(b.event).epoch_microseconds);
   return x<y?-1:x>y?1:a.event.event_fingerprint.localeCompare(b.event.event_fingerprint);
  });
  if(ordered.length>2000)fail("KDS_PAID_LIVE_HISTORY_LIMIT");
  const history=[],allocations=new Map(),serials=new Map();let state;
  for(const {event} of ordered){checkDeadline();
   history.push(event);state=time.projectState(history);
   const active=new Map(state.active_lines.map(l=>[l.canonical_line_id,l]));
   for(const key of new Set([...allocations.keys(),...active.keys()])){
    const line=active.get(key),count=line?.quantity||0;
    if(!Number.isSafeInteger(count)||count<0||count>1000)fail("KDS_PAID_QUANTITY_INVALID");
    let units=allocations.get(key)||[];
    if(count<units.length)units=units.slice(0,count);
    while(units.length<count){const serial=serials.get(key)||0;units.push(JSON.stringify([key,serial]));serials.set(key,serial+1);}
    allocations.set(key,units);
   }
  }
  const cups=[],lines=[];
  for(const line of state.active_lines){
   const name=text(line.item_name),item=text(line.item_id),lineId=text(line.canonical_line_id),note=line.note||"";
   const modifiers=line.modifiers.map(m=>({item_id:text(m.item_id),item_name:text(m.item_name),quantity:m.quantity,unit_id:m.unit_id??null}));
   if(typeof note!=="string"||note.length>1000||modifiers.some(m=>!Number.isSafeInteger(m.quantity)||m.quantity<1))fail("KDS_PAID_MODIFIERS_INVALID");
   const category=line.item_class_id==="DU"?"Đồ uống":line.item_class_id==="DA"?"Đồ ăn":line.item_class_id==="TP"?"Topping rời":"Món khác — cần kiểm tra";
   const group=category+" / "+text(line.item_type_id);
   const display=name+(note?` — ${note}`:"")+(modifiers.length?` · Topping TOÀN DÒNG (${line.quantity} phần): ${modifiers.map(m=>`${m.item_name} ×${m.quantity}`).join(", ")}`:"");
   if(display.length>4000)fail("KDS_PAID_DISPLAY_LIMIT");
   lines.push({line_id:lineId,item_id:item,item_name:name,quantity:line.quantity,note,modifiers});
   for(const unit_key of allocations.get(lineId))cups.push({unit_key,item_id:item,item_name:display,item_group:group});
  }
  if(cups.length>1000)fail("KDS_PAID_ORDER_LIMIT");
  const latest=ordered.at(-1),first=interpretFabiC04NormalizedClockV1(ordered[0].event),invoice=verified.get(id);
  const table=latest.table;if(table.length>500)fail("KDS_PAID_TABLE_LIMIT");
  const order={policy:POLICY,pos_parent:branch.pos_parent,pos_id:String(branch.pos_id),store_uid:scope.store_uid,tran_id:id,
   tran_no:latest.number||id,pos_name:invoice?.pos_name||"",table_name:table,
   source_event_fingerprints:ordered.map(x=>x.event.event_fingerprint),
   started_at_ms:first.epoch_milliseconds,payment_verification:invoice?"verified":"pending_verification",
   paid_reported_at_ms:invoice?.paid_reported_at_ms||null,lines,cups,total_units:cups.length};
  orders.push({...order,content_hash:hash(order)});
 }
 return {policy:POLICY,orders,source_invoice_count:invoices.size,created_unit_count:orders.reduce((n,o)=>n+o.cups.length,0)};
}
module.exports={POLICY,projectC04OrdersV1};
