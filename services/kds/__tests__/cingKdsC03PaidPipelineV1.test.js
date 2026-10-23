"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {projectC03PaidOrdersV1}=require("../cingKdsC03PaidProjectionV1");
const {createC03PaidSourceV1}=require("../cingKdsC03PaidSourceV1");
const {createC03PaidWorkerV1}=require("../cingKdsC03PaidWorkerV1");
const scope={company_uid:"company",brand_uid:"brand",store_uid:"store"};
const branch={pos_parent:"parent",pos_id:"123"};
function fixtures({id="tran-test",quantity=2,mods=1}={}) {
  const topping={id_sale_detail:`mod-${id}`,item_id:"mod-item",item_name:"Topping",item_class_id:"TP",unit_id:"MON",quantity:mods};
  const line={id_sale_detail:`line-${id}`,item_id:"drink-item",item_name:"Drink",item_class_id:"DU",item_type_id:"type",unit_id:"MON",price:40000,quantity,toppings:mods?[topping]:[],note:"Ít đá"};
  const wall=Date.parse("2026-10-22T12:00:00Z");
  const log={tran_id:id,log_type:"SALE_CHANGE",created_at:wall/1000,updated_at:wall/1000,start_date:wall-25200000,
    fmt_created_at:"2026-10-22 12:00:00:000001",fmt_updated_at:"2026-10-22 12:00:00:000001",
    change_data:{...scope,tran_id:id,tran_no:"123456",sale_detail:[line]}};
  const sale={tran_id:id,tran_no:"123456",store_uid:scope.store_uid,start_date:wall-25200000,tran_date:wall-25200000+60000,table_name:"Bàn 3",
    sale_detail:[{item_name:"Drink",unit_id:"MON",price:40000,quantity,toppings:mods?[{item_id:"mod-item",item_name:"Topping",unit_id:"MON",quantity:mods}]:[]}],
    customer_phone:"SHOULD_NOT_BE_STORED",sale_payment_method:[]};
  return {sale,log};
}
function project(sales,logs,extra={}){return projectC03PaidOrdersV1({sales,logs,scope,branch,...extra});}

test("C03 is paid authority without CRM or method heuristics; source identifiers form distinct units",()=>{
  const {sale,log}=fixtures();const r=project([sale],[log]);
  assert.equal(r.orders.length,1);assert.equal(r.orders[0].cups.length,2);
  assert.equal(new Set(r.orders[0].cups.map(c=>c.unit_key)).size,2);
  assert.equal(r.orders[0].cups[0].item_id,"drink-item");assert.equal(r.orders[0].table_name,"Bàn 3");
  assert.equal(r.orders[0].lines[0].modifiers[0].quantity,1);
  assert.match(r.orders[0].cups[0].item_name,/TOÀN DÒNG \(2 phần\)/);
  assert.doesNotMatch(JSON.stringify(r),/SHOULD_NOT_BE_STORED|sale_payment_method|customer_phone/);
});
test("C04-only invoices never create work; unpaid absence from C03 is sufficient exclusion",()=>{
  const {log}=fixtures();assert.equal(project([],[log]).orders.length,0);
});
test("signed additions/reversals and duplicate event replay keep exact net parent/modifier quantities",()=>{
  const {sale,log}=fixtures({quantity:2,mods:2});const add=structuredClone(log),reverse=structuredClone(log);
  reverse.created_at++;reverse.updated_at++;reverse.fmt_created_at="2026-10-22 12:00:01:000001";reverse.fmt_updated_at=reverse.fmt_created_at;
  reverse.change_data.sale_detail[0].quantity=-1;reverse.change_data.sale_detail[0].toppings[0].quantity=-1;
  sale.sale_detail[0].quantity=1;sale.sale_detail[0].toppings[0].quantity=1;
  assert.equal(project([sale],[reverse,add,add]).orders[0].cups.length,1);
});
test("missing history, parent mismatch, exact modifier identity and quantity mismatch prevent any admission",()=>{
  const {sale,log}=fixtures();assert.throws(()=>project([sale],[]),/HISTORY_MISSING/);
  for(const mutate of [s=>s.sale_detail[0].quantity++,s=>s.sale_detail[0].toppings[0].quantity++,s=>s.sale_detail[0].toppings[0].item_id="wrong"]) {
    const changed=structuredClone(sale);mutate(changed);assert.throws(()=>project([changed],[log]),/PARITY_MISMATCH/);
  }
});
test("foreign scope, duplicate C03 transaction and fractional quantities are rejected",()=>{
  const {sale,log}=fixtures();assert.throws(()=>project([sale,sale],[log]),/DUPLICATE_INVOICE/);
  const foreign=structuredClone(log);foreign.change_data.brand_uid="wrong";assert.throws(()=>project([sale],[foreign]),/SCOPE_MISMATCH/);
  sale.store_uid="wrong";assert.throws(()=>project([sale],[log]),/STORE_MISMATCH/);
  const a=fixtures();a.sale.sale_detail[0].quantity=0.5;assert.throws(()=>project([a.sale],[a.log]),/QUANTITY_INVALID/);
});
test("already admitted paid snapshot stays immutable; no new units or status reset after post-paid changes",()=>{
  const {sale}=fixtures();sale.sale_detail[0].quantity=999;
  assert.equal(project([sale],[],{knownTransactions:[sale.tran_id]}).orders.length,0);
});
test("unknown signed source log holds; print logs cannot change unit totals",()=>{
  const {sale,log}=fixtures();assert.equal(project([sale],[log,{...log,log_type:"RE_PRINT_BILL"}]).created_unit_count,2);
  assert.throws(()=>project([sale],[log,{...log,log_type:"UNKNOWN"}]),/UNKNOWN_LOG_TYPE/);
});
test("absent source units remain absent, historical custom lines retained rather than silently excluded",()=>{
  const {sale,log}=fixtures({quantity:1,mods:0});sale.sale_detail[0].unit_id="";log.change_data.sale_detail[0].unit_id=null;
  log.change_data.sale_detail[0].item_id="CUSTOMESALE-test";log.change_data.sale_detail[0].item_class_id="ITEM_TYPE_OTHER";
  const r=project([sale],[log]);assert.equal(r.created_unit_count,1);assert.match(r.orders[0].cups[0].item_group,/kiểm tra/);
});
function source(requestFn,extra={}){return createC03PaidSourceV1({requestFn,authProvider:async()=>"auth-test",appAccessTokenProvider:async()=>"app-test",...extra});}
const query={scope,branch,fromMs:Date.parse("2026-10-22T00:00:00+07:00"),toMs:Date.parse("2026-10-22T18:00:00+07:00")};
test("source exhausts both paginations and preserves exact auth with expanded C03 details",async()=>{
  const {sale,log}=fixtures();let requests=0;
  const r=await source(async input=>{requests++;const url=new URL(input.url);assert.equal(input.headers.Authorization,"auth-test");
    assert.equal(input.headers.access_token,"app-test");const page=Number(url.searchParams.get("page"));
    if(url.pathname.includes("sale-by-date")){assert.equal(url.searchParams.get("csv"),"1");return {status:200,json:{data:page===1?[sale]:[]}};}
    return {status:200,body:{data:page===1?[log]:[]}};
  })(query);
  assert.equal(requests,4);assert.equal(r.c03_pages_exhausted,true);assert.equal(r.orders.length,1);
});
test("repeated page and page cap hold; never report partial snapshots as complete",async()=>{
  const {sale}=fixtures();await assert.rejects(source(async()=>({status:200,json:{data:[sale]}}),{maxPages:2})(query),/PAGINATION_REPEATED/);
  let n=0;await assert.rejects(source(async()=>({status:200,json:{data:[{...sale,tran_id:`t-${++n}`} ]}}),{maxPages:2})(query),/PAGINATION_INCOMPLETE/);
});
test("known invoices avoid C04 entirely; invalid historical window cannot issue C04",async()=>{
  const {sale}=fixtures();let calls=0;
  const r=await source(async()=>({status:200,json:{data:++calls===1?[sale]:[]}}))({...query,knownTransactions:[sale.tran_id]});assert.equal(r.requests,2);assert.equal(r.orders.length,0);
  sale.start_date=null;calls=0;await assert.rejects(source(async()=>({status:200,json:{data:++calls===1?[sale]:[]}}))(query),/HISTORY_WINDOW_INVALID/);assert.equal(calls,2);
});
function claim(){return {outcome:"claimed",scope,branch,from_ms:query.fromMs,to_ms:query.toMs,known_transactions:[]};}
const empty={orders:[],requests:2,source_invoice_count:0,c03_pages_exhausted:true,c04_pages_exhausted:null};
test("worker construction and disabled DB control make no source call; simultaneous ticks coalesce",async()=>{
  let calls=0,resolve;const worker=createC03PaidWorkerV1({rpc:async()=>({outcome:"disabled"}),collect:async()=>{calls++;}});
  assert.equal(calls,0);assert.equal((await worker.runOnce()).status,"disabled");assert.equal(calls,0);await worker.close();
  let writes=0;const w=createC03PaidWorkerV1({rpc:async op=>op==="claim"?claim():(writes++,{outcome:"committed"}),collect:()=>new Promise(r=>{resolve=r;})});
  const first=w.runOnce(),second=w.runOnce();assert.equal(first,second);await new Promise(setImmediate);resolve(empty);await first;assert.equal(writes,1);await w.close();
});
test("source failure releases lease, cannot commit, and never logs unsanitized errors",async()=>{
  const ops=[];const w=createC03PaidWorkerV1({rpc:async op=>{ops.push(op);return claim();},collect:async()=>{throw new Error("credential-private-customer");}});
  const r=await w.runOnce();assert.deepEqual(ops,["claim","release"]);assert.equal(r.status,"hold");assert.doesNotMatch(JSON.stringify(r),/credential-private/);await w.close();
});
test("close aborts collection and a late response can never commit or reschedule",async()=>{
  const ops=[];let resolve;const w=createC03PaidWorkerV1({rpc:async op=>{ops.push(op);return claim();},collect:()=>new Promise(r=>{resolve=r;})});
  const run=w.runOnce();await new Promise(setImmediate);const close=w.close();resolve(empty);await close;assert.equal((await run).status,"hold");assert.deepEqual(ops,["claim"]);
});
test("revocation between claim and commit cannot be reported as a successful cycle",async()=>{
  const w=createC03PaidWorkerV1({rpc:async op=>op==="claim"?claim():{outcome:"disabled"},collect:async()=>empty});
  assert.equal((await w.runOnce()).status,"hold");await w.close();
});
module.exports={fixtures,scope,branch};

test("deadline aborts an in-flight source collection and prevents commit",async()=>{
  const ops=[];const w=createC03PaidWorkerV1({deadlineMs:1000,rpc:async op=>{ops.push(op);return claim();},
    collect:({signal})=>new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error("cancelled")),{once:true}))});
  const r=await w.runOnce();assert.equal(r.error_code,"KDS_PAID_DEADLINE");assert.deepEqual(ops,["claim","release"]);await w.close();
});
