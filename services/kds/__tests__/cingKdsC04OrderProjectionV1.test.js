"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {projectC04OrdersV1}=require("../cingKdsC04OrderProjectionV1");
const {createC03PaidSourceV1}=require("../cingKdsC03PaidSourceV1");
const scope={company_uid:"company",brand_uid:"brand",store_uid:"store"},branch={pos_parent:"parent",pos_id:"123"};
function event(second=0,quantity=1,id="txn",line="line"){
 const wall=Date.parse("2026-10-23T20:40:00Z")+second*1000,fmt=new Date(wall).toISOString().slice(0,19).replace("T"," ")+":000001";
 return {tran_id:id,log_type:"SALE_CHANGE",created_at:wall/1000,updated_at:wall/1000,start_date:wall-25200000,fmt_created_at:fmt,fmt_updated_at:fmt,
 change_data:{...scope,tran_id:id,tran_no:"240151",table_name:"THẺ RUNG 05 - THẺ RUNG - TẠI CHỖ",sale_detail:[{id_sale_detail:line,item_id:"ITEM-A",item_name:"Drink",item_class_id:"DU",item_type_id:"type",unit_id:"MON",price:41000,quantity,toppings:[]}]}};
}
function project(logs,sales=[],extra={}){return projectC04OrdersV1({sales,logs,scope,branch,...extra});}
function sale(quantity=1){return {tran_id:"txn",tran_no:"240151",store_uid:"store",tran_date:Date.parse("2026-10-23T15:00:00Z"),sale_detail:[{item_name:"Drink",price:41000,unit_id:"MON",quantity,toppings:[]}]};}
test("unpaid C04 order enters work without payment fabrication",()=>{
 const o=project([event()]).orders[0];assert.equal(o.payment_verification,"pending_verification");assert.equal(o.cups.length,1);assert.equal(o.paid_reported_at_ms,null);
});
test("calling more retains prior keys; same card across transactions stays separate",()=>{
 const a=event(),b=event(1,2,"txn","second"),c=event(2,1,"another");
 const before=project([a]).orders[0].cups[0].unit_key,after=project([c,b,a]).orders;
 assert.equal(after.length,2);assert.equal(after.find(o=>o.tran_id==="txn").cups.length,3);assert.ok(after.find(o=>o.tran_id==="txn").cups.some(c=>c.unit_key===before));
});
test("source replay and event input order do not create extra units",()=>{
 const a=event(),b=event(1,2);assert.deepEqual(project([a,b,a]),project([b,a]));
});
test("reduction then addition never resurrects a cancelled unit identity",()=>{
 const a=event(0,2),b=event(1,-1),c=event(2,1);
 const before=project([a]).orders[0],after=project([c,b,a]).orders[0];
 assert.equal(after.cups.length,2);assert.equal(after.cups[0].unit_key,before.cups[0].unit_key);assert.notEqual(after.cups[1].unit_key,before.cups[1].unit_key);
});
test("complete cancellation produces an explicit zero-unit snapshot",()=>{assert.equal(project([event(),event(1,-1)]).orders[0].cups.length,0);});
test("C03 payment confirmation retains C04 unit identities",()=>{
 const a=event(),before=project([a]).orders[0],after=project([a],[sale()]).orders[0];assert.deepEqual(after.cups,before.cups);assert.equal(after.payment_verification,"verified");
});
test("C03 mismatch, foreign store, invalid quantities and missing history hold",()=>{
 assert.throws(()=>project([event()],[sale(2)]),/PARITY/);
 const foreign=event();foreign.change_data.store_uid="foreign";assert.throws(()=>project([foreign]),/SCOPE/);
 assert.throws(()=>project([event(0,0.5)]),/QUANTITY/);assert.throws(()=>project([],[sale()]),/HISTORY/);
});
test("paid transactions already admitted remain immutable",()=>{assert.equal(project([event(0,99)],[],{knownTransactions:["txn"]}).orders.length,0);});
test("print events do not create work; unknown event kinds hold",()=>{
 assert.equal(project([{...event(),log_type:"RE_PRINT_BILL"}]).orders.length,0);assert.throws(()=>project([{...event(),log_type:"OTHER"}]),/UNKNOWN/);
});
test("customer, payment traces and credentials never enter output",()=>{
 const a=event();a.change_data.extra_data={customer_phone:"SECRET"};a.change_data.sale_payment_method=[{trace_no:"SECRET"}];assert.doesNotMatch(JSON.stringify(project([a])),/SECRET|customer_phone|trace_no/);
});
test("live collection queries C04 even with empty C03, exhausts pages, and forwards abort",async()=>{
 const paths=[];const collect=createC03PaidSourceV1({authProvider:()=>"test",appAccessTokenProvider:()=>"test",requestFn:async r=>{
 const u=new URL(r.url);paths.push(u.pathname);assert.ok(r.signal);const rows=u.pathname.includes("sale-change-log")&&u.searchParams.get("page")==="1"?[event()]:[];return {status:200,body:{data:rows},json:{data:rows}};
 }});const result=await collect({scope,branch,openTransactions:[],fromMs:Date.parse("2026-10-23T00:00:00+07:00"),toMs:Date.parse("2026-10-23T23:59:59+07:00"),intakeMode:"c04_order_intake_v1"});
 assert.equal(result.orders.length,1);assert.equal(result.c04_pages_exhausted,true);assert.equal(paths.filter(p=>p.includes("sale-change-log")).length,2);
});
test("CPU-bound projection observes its absolute deadline before producing work",()=>{assert.throws(()=>project([event()],[],{deadlineAt:0}),/DEADLINE/);});
test("C03 temporary transport outage cannot suppress complete C04 work or fabricate paid state",async()=>{
 const {createC04OrderSourceV1}=require("../cingKdsC04OrderSourceV1");
 const collect=createC04OrderSourceV1({authProvider:()=>"test",appAccessTokenProvider:()=>"test",requestFn:async r=>{
  const u=new URL(r.url);if(u.pathname.includes("sale-by-date"))throw new Error("fixture network failure");
  const rows=u.searchParams.get("page")==="1"?[event()]:[];return {status:200,body:{data:rows},json:{data:rows}};
 }});
 const result=await collect({scope,branch,openTransactions:[],fromMs:Date.parse("2026-10-23T00:00:00+07:00"),toMs:Date.parse("2026-10-23T23:59:59+07:00")});
 assert.equal(result.c03_pages_exhausted,false);assert.equal(result.c04_pages_exhausted,true);assert.equal(result.orders[0].payment_verification,"pending_verification");
});
test("overnight recovery excludes unrelated historical transactions",async()=>{
 const {createC04OrderSourceV1}=require("../cingKdsC04OrderSourceV1");
 const from=Date.parse("2026-10-23T00:00:00+07:00"),inside=event(),old=event(0,1,"unrelated");inside.change_data.tran_date=from-3600000;
 const collect=createC04OrderSourceV1({authProvider:()=>"test",appAccessTokenProvider:()=>"test",requestFn:async r=>{
  const u=new URL(r.url);let rows=[];
  if(u.pathname.includes("sale-change-log")&&u.searchParams.get("page")==="1")rows=Number(u.searchParams.get("start_date"))<from?[old,inside]:[inside];
  return {status:200,body:{data:rows},json:{data:rows}};
 }});
 const result=await collect({scope,branch,openTransactions:[],fromMs:from,toMs:Date.parse("2026-10-23T23:59:59+07:00")});
 assert.deepEqual(result.orders.map(o=>o.tran_id),["txn"]);
});
test("default read model excludes unpaid rows; only explicit trusted DB admission opts in",()=>{
 const {buildOperationsReadModel}=require("../cingKdsOperationsReadModelV1");
 const o={id:"o",pos_parent:"p",pos_id:"1",started_at:"2026-10-23T00:00:00Z",payment_verification:"pending_verification",ingestion_status:"processed",conflict_status:"clear",order_admission_verified:true,
 cups:[{id:"c",item_name:"Drink",item_group:"DU",status:"pending"}]};
 const args={orders:[o],now:"2026-10-23T00:01:00Z",warningMinutes:20,criticalMinutes:40};
 assert.equal(buildOperationsReadModel(args).preparation_queue.length,0);
 assert.equal(buildOperationsReadModel({...args,allowC04Orders:true}).preparation_queue.length,1);
 assert.equal(buildOperationsReadModel({...args,orders:[{...o,order_admission_verified:false}],allowC04Orders:true}).preparation_queue.length,0);
});
function emptyOnlineCancel(){const raw=event(0,1,"online-cancel");raw.log_type="CANCEL_ORDER_ONLINE";
 raw.change_data={...scope,tran_id:"online-cancel",tran_no:"",origin_tran_id:"",foodbook_order_id:"2697733019",sale_detail:[]};raw.sale_current={sale_detail:[],sale_payment_method:[]};return raw;}
test("observed empty online cancellation with no source, C03 or DB-admitted work is inert",()=>{
 const result=project([emptyOnlineCancel()]);assert.deepEqual(result.orders,[]);assert.equal(result.non_preparation_cancel_observations,1);
});
test("inert online cancellation cannot block an unrelated real unpaid order",()=>{
 const result=project([emptyOnlineCancel(),event()]);assert.equal(result.orders.length,1);assert.equal(result.orders[0].tran_id,"txn");assert.equal(result.orders[0].cups.length,1);
});
test("online cancellation touching a persisted open transaction always requires review",()=>{
 assert.throws(()=>project([emptyOnlineCancel()],[],{openTransactions:["online-cancel"]}),/ONLINE_CANCEL_REVIEW_REQUIRED/);
});
test("online cancellation with signed history or a C03 invoice cannot silently clear or disappear",()=>{
 assert.throws(()=>project([emptyOnlineCancel(),event(1,1,"online-cancel")]),/ONLINE_CANCEL_REVIEW_REQUIRED/);
 assert.throws(()=>project([emptyOnlineCancel()],[{...sale(),tran_id:"online-cancel"}]),/ONLINE_CANCEL_REVIEW_REQUIRED/);
});
test("foreign scope, changed identity and invalid clocks cannot enter the inert-cancel branch",()=>{
 const a=emptyOnlineCancel();a.change_data.store_uid="foreign";assert.throws(()=>project([a]),/SCOPE/);
 const b=emptyOnlineCancel();b.change_data.tran_id="different";assert.throws(()=>project([b]),/ONLINE_CANCEL_REVIEW_REQUIRED/);
 const c=emptyOnlineCancel();c.fmt_created_at="wrong";assert.throws(()=>project([c]),/CLOCK/);
});
test("source deltas, invoice or origin require review; current snapshots are not work authority",()=>{
 for(const mutate of [r=>r.change_data.sale_detail.push({}),r=>r.change_data.tran_no="240151",r=>r.change_data.origin_tran_id="origin",r=>r.change_data.foodbook_order_id=""]){
  const raw=emptyOnlineCancel();mutate(raw);assert.throws(()=>project([raw]),/ONLINE_CANCEL_REVIEW_REQUIRED/);
 }
});
test("collector refuses live mode without the database open-transaction contract before HTTP",async()=>{
 const {createC04OrderSourceV1}=require("../cingKdsC04OrderSourceV1");let calls=0;
 const collect=createC04OrderSourceV1({authProvider:()=>"test",appAccessTokenProvider:()=>"test",requestFn:()=>{calls++;}});
 await assert.rejects(collect({scope,branch,fromMs:0,toMs:1}),/OPEN_TRANSACTIONS_REQUIRED/);assert.equal(calls,0);
});
test("worker forwards persisted open identities to the source collector",async()=>{
 const {createC03PaidWorkerV1}=require("../cingKdsC03PaidWorkerV1");let received;
 const worker=createC03PaidWorkerV1({rpc:async op=>op==="claim"?{outcome:"claimed",intake_mode:"c04_order_intake_v1",open_transactions:["already-open"],known_transactions:[],scope,branch,from_ms:0,to_ms:1}:{outcome:"committed"},
 collect:async input=>{received=input;return {orders:[],requests:0,source_invoice_count:0,c03_pages_exhausted:true,c04_pages_exhausted:true};}});
 assert.equal((await worker.runOnce()).status,"completed");assert.deepEqual(received.openTransactions,["already-open"]);await worker.close();
});

test("observed cancelled-online current snapshot with one cooking item and one payment entry creates no cups or paid authority",()=>{
 const raw=emptyOnlineCancel();raw.sale_current={sale_detail:[{item_id:"ITEM-BFOD",quantity:1,status:"COOKING",customer_phone:"PRIVATE"}],sale_payment_method:[{amount:41000,trace_no:"PRIVATE"}]};
 const result=project([raw,event()]);assert.equal(result.orders.length,1);assert.equal(result.orders[0].tran_id,"txn");assert.equal(result.orders[0].cups.length,1);assert.equal(result.orders[0].payment_verification,"pending_verification");assert.equal(result.non_preparation_cancel_observations,1);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|ITEM-BFOD|trace_no|customer_phone/);
 assert.throws(()=>project([raw],[],{openTransactions:["online-cancel"]}),/ONLINE_CANCEL_REVIEW_REQUIRED/);
});
test("malformed or unbounded current snapshots still require review",()=>{
 for(const mutate of [r=>r.sale_current.sale_detail=null,r=>r.sale_current.sale_payment_method=null,r=>r.sale_current.sale_detail=Array(1001).fill({}),r=>r.sale_current.sale_payment_method=Array(1001).fill({})]){const raw=emptyOnlineCancel();mutate(raw);assert.throws(()=>project([raw]),/ONLINE_CANCEL_REVIEW_REQUIRED/);}
});
