"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path'),Module=require('node:module');
const {createKdsCycleReadsV2}=require('../cingKdsCycleReadsV2');
const {createC04OrderSourceV1}=require('../cingKdsC04OrderSourceV1');
const {createC03PaidWorkerV1}=require('../cingKdsC03PaidWorkerV1');
const source=execFileSync('git',['show','7cf90fa3b6340fe97b8c5dada55c032c5aec0324:services/kds/cingKdsC04OrderSourceV1.js'],{cwd:path.resolve(__dirname,'../../..'),encoding:'utf8'});
const baseline=new Module(path.resolve(__dirname,'../baseline.fixture.js'),module);baseline.filename=baseline.id;baseline.paths=module.paths;baseline._compile(source,baseline.filename);
const legacy=baseline.exports.createC04OrderSourceV1;
const day=86400000,offset=7*3600000;
const scope={company_uid:'company',brand_uid:'brand',store_uid:'store'},branch={pos_parent:'parent',pos_id:'123'};
const from=Date.parse('2026-10-24T00:00:00+07:00'),to=Date.parse('2026-11-16T00:00:00+07:00');
function event(second=0,quantity=1,id='txn'){
 const wall=Date.parse('2026-10-23T20:40:00Z')+second*1000,fmt=new Date(wall).toISOString().slice(0,19).replace('T',' ')+':000001';
 return {tran_id:id,log_type:'SALE_CHANGE',created_at:wall/1000,updated_at:wall/1000,start_date:wall-offset,fmt_created_at:fmt,fmt_updated_at:fmt,change_data:{...scope,tran_id:id,tran_no:'240151',tran_date:from-3600000,table_name:'Table',sale_detail:[{id_sale_detail:'line',item_id:'ITEM-A',item_name:'Drink',item_class_id:'DU',item_type_id:'type',unit_id:'MON',price:41000,quantity,toppings:[]}]}};
}
function sale(quantity){return {tran_id:'txn',tran_no:'240151',store_uid:'store',start_date:from-3600000,tran_date:from+1000,sale_detail:[{item_name:'Drink',price:41000,unit_id:'MON',quantity,toppings:[]}]};}
function fixture(logs,sales=[],delay=0){
 const counts={calls:0,active:0,peak:0};
 const requestFn=async r=>{counts.calls++;counts.active++;counts.peak=Math.max(counts.peak,counts.active);
  try{if(delay)await new Promise(resolve=>setTimeout(resolve,delay));const u=new URL(r.url);let rows=[];
   if(u.pathname.includes('sale-change-log')){
    if(u.searchParams.get('page')==='1'&&Number(u.searchParams.get('start_date'))<=from+1000&&Number(u.searchParams.get('end_date'))>=from+1000)rows=structuredClone(logs);
   }else if(u.searchParams.get('page')==='1')rows=structuredClone(sales);
   return {status:200,body:{data:rows},json:{data:rows}};
  }finally{counts.active--;}
 };
 return {requestFn,counts};
}
const args={scope,branch,fromMs:from,toMs:to,knownTransactions:[],openTransactions:[]};
function publicResult(x){const{requests,source_metrics,...business}=x;return business;}
async function pair(logs,sales=[],extra={}){
 const a=fixture(logs,sales),b=fixture(logs,sales);
 const old=await legacy({requestFn:a.requestFn,authProvider:()=> 'private',appAccessTokenProvider:()=> 'private'} )({...args,...extra});
 const next=await createC04OrderSourceV1({requestFn:b.requestFn,authProvider:()=> 'private',appAccessTokenProvider:()=> 'private'})({...args,...extra});
 assert.deepEqual(publicResult(next),publicResult(old));assert.ok(next.requests<old.requests);assert.ok(next.source_metrics.cache_hits>0);assert.ok(b.counts.peak<=3);assert.doesNotMatch(JSON.stringify(next.source_metrics),/private|https|txn|company/);return {old,next};
}
test('25-day history replay is byte-equivalent in business output and removes duplicate requests',async()=>{const {old,next}=await pair([event()]);assert.equal(next.orders[0].cups.length,1);assert.ok(next.requests<=old.requests*0.65);});
test('late payment preserves invoice authority, exact quantity and stable cup keys',async()=>{const {next}=await pair([event()],[sale(1)]);assert.equal(next.orders[0].payment_verification,'verified');assert.equal(next.orders[0].cups.length,1);});
test('reduction, re-addition and complete cancellation preserve the original projection',async()=>{await pair([event(0,2),event(1,-1),event(2,1)]);const {next}=await pair([event(0,2),event(1,-2)]);assert.equal(next.orders[0].cups.length,0);});
test('already paid identities and independent transactions remain isolated',async()=>{await pair([event(),event(1,3,'other')],[],{knownTransactions:['txn']});});
test('C03 parity mismatch is still rejected',async()=>{
 const f=fixture([event()],[sale(2)]);await assert.rejects(createC04OrderSourceV1({requestFn:f.requestFn,authProvider:()=> 'private',appAccessTokenProvider:()=> 'private'})(args),/PARITY/);
});
test('same-query cache is private to one cycle and the next cycle reads fresh provider data',async()=>{
 let quantity=1;const collect=createC04OrderSourceV1({requestFn:async r=>fixture([event(0,quantity)]).requestFn(r),authProvider:()=> 'private',appAccessTokenProvider:()=> 'private'});
 assert.equal((await collect(args)).orders[0].cups.length,1);quantity=2;assert.equal((await collect(args)).orders[0].cups.length,2);
});
test('bounded parallel reads retain chronological day/page order and complete every interval',async()=>{
 const c=createKdsCycleReadsV2({requestFn:async()=>({status:200,body:{data:[]}}),deadlineAt:Date.now()+5000});
 try{const starts=[];const rows=await c.collectDays(from,from+4*day,async fetch=>{const out=[];for(let p=1;p<=2;p++){const b=await fetch(p);if(!b.length)return out;out.push(...b);}throw Error('incomplete');},async(a,b,p)=>{if(p===2)return [];starts.push(a);await new Promise(r=>setTimeout(r,(5-(a-from)/day)*2));return [{start:a,end:b}];});assert.equal(rows.length,5);rows.forEach((r,i)=>{assert.equal(Math.floor((r.start+offset)/day),Math.floor((r.end+offset)/day));if(i)assert.equal(rows[i-1].end+1,r.start);});}finally{c.close();}
});
test('history past 32 days is read completely under the actual request budget',async()=>{
 const f=fixture([]);const result=await createC04OrderSourceV1({requestFn:f.requestFn,authProvider:()=> 'x',appAccessTokenProvider:()=> 'y'})({...args,fromMs:from-40*day});assert.equal(result.c04_pages_exhausted,true);assert.ok(result.source_metrics.day_windows>32);assert.ok(result.requests<192);
});
test('semaphore limits actual transport concurrency and coalesces identical in-flight queries',async()=>{
 let active=0,peak=0,calls=0;const c=createKdsCycleReadsV2({deadlineAt:Date.now()+1000,requestFn:async()=>{active++;calls++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return {status:200,body:{data:[]}};}});
 try{const input={method:'GET',url:'https://posapi.ipos.vn/api/v3/pos-cms/sale-change-log?page=1'};await Promise.all(Array.from({length:20},(_,i)=>c.request({...input,url:input.url+'&day='+i%5})));assert.equal(calls,5);assert.ok(peak<=3);assert.equal(c.metrics().cache_hits,15);}finally{c.close();}
});
test('a failed day aborts siblings and waits for transport cleanup before returning',async()=>{
 let active=0;const c=createKdsCycleReadsV2({deadlineAt:Date.now()+2000,requestFn:async input=>{active++;try{const u=new URL(input.url);if(u.searchParams.get('day')==='0')throw Error('source-failure');await new Promise((resolve,reject)=>{input.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});});return {status:200,body:{data:[]}};}finally{active--;}}});
 try{await assert.rejects(c.collectDays(from,from+5*day,async fn=>fn(1),async a=>{await c.request({method:'GET',url:'https://posapi.ipos.vn/api/v3/pos-cms/sale-change-log?day='+((a-from)/day)});return [];}),/source-failure/);assert.equal(active,0);assert.ok(c.metrics().requests<=3);}finally{c.close();}
});
test('request/memory budgets and external abort prevent further reads',async()=>{
 for(const config of [{maxRequests:1},{maxCacheBytes:2}]){const c=createKdsCycleReadsV2({...config,deadlineAt:Date.now()+1000,requestFn:async()=>({status:200,body:{data:['payload']}})});try{const read=p=>c.request({method:'GET',url:'https://posapi.ipos.vn/api/v3/pos-cms/sale-change-log?page='+p});if(config.maxRequests){await read(1);await assert.rejects(read(2),/REQUEST_BUDGET/);}else await assert.rejects(read(1),/CACHE_BUDGET/);assert.throws(()=>c.check(),/BUDGET/);}finally{c.close();}}
 const controller=new AbortController();const c=createKdsCycleReadsV2({signal:controller.signal,deadlineAt:Date.now()+1000,requestFn:async()=>{throw Error('must not run');}});controller.abort();assert.throws(()=>c.request({url:'https://posapi.ipos.vn',method:'GET'}),/DEADLINE/);c.close();
});
test('client transport wrapping cannot turn a budget failure into degraded-but-successful C03',async()=>{
 const start=Date.parse('2026-01-01T00:00:00+07:00');const end=start+190*day;
 const collect=createC04OrderSourceV1({authProvider:()=> 'x',appAccessTokenProvider:()=> 'y',requestFn:async input=>{const u=new URL(input.url);const rows=u.pathname.includes('sale-by-date')&&u.searchParams.get('page')==='1'?[sale(1)]:[];return {status:200,body:{data:rows},json:{data:rows}};}});
 await assert.rejects(collect({...args,fromMs:start,toMs:end,knownTransactions:['txn']}),/REQUEST_BUDGET/);
});
test('worker backs off transient holds and resets its poll delay after success',async()=>{
 const scheduled=[],reports=[];let fail=true;const schedule=(fn,ms)=>{const t={fn,ms};scheduled.push(t);return t;},cancel=t=>{const i=scheduled.indexOf(t);if(i>=0)scheduled.splice(i,1);};
 const worker=createC03PaidWorkerV1({schedule,cancel,report:r=>reports.push(r),rpc:async op=>{if(fail)throw Object.assign(Error(),{code:'C04_RATE_LIMITED'});return op==='claim'?{outcome:'claimed',scope,branch,from_ms:from,to_ms:to,intake_mode:'c04_order_intake_v1',known_transactions:[],open_transactions:[]}:{outcome:'committed'};},collect:async()=>({orders:[],requests:1,c03_pages_exhausted:true,c04_pages_exhausted:true,source_invoice_count:0})});
 worker.start();for(const ms of [10000,20000,30000]){await scheduled.shift().fn();assert.equal(scheduled[0].ms,ms);}fail=false;await scheduled.shift().fn();assert.equal(scheduled[0].ms,5000);await worker.close();assert.equal(scheduled.length,0);assert.equal(reports.at(-1).status,'completed');
});
