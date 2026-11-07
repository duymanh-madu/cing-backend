'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {splitVietnamDaysV1,collectVietnamDayPagesV1}=require('../cingKdsVietnamDayWindowsV1');
const {createC04OrderSourceV1}=require('../cingKdsC04OrderSourceV1');
const {isReprintOrderObservationV1}=require('../cingKdsC04ReprintOrderObservationV1');
const {createKdsOperationsBridgeV1}=require('../cingKdsOperationsBridgeV1');
const offset=7*3600000,day=86400000;
const vnDay=ms=>Math.floor((ms+offset)/day);
const scope={company_uid:'company',brand_uid:'brand',store_uid:'store'};
const branch={pos_parent:'BRAND-DQIR',pos_id:'109664'};
test('midnight recovery covers every millisecond exactly once across three Vietnam days',()=>{
 const start=Date.parse('2026-11-05T23:59:59.900+07:00'),end=Date.parse('2026-11-07T00:00:00.050+07:00');
 const windows=splitVietnamDaysV1(start,end);assert.equal(windows.length,3);
 assert.equal(windows[0].fromMs,start);assert.equal(windows.at(-1).toMs,end);
 let length=0;
 windows.forEach((w,i)=>{assert.equal(vnDay(w.fromMs),vnDay(w.toMs));length+=w.toMs-w.fromMs+1;if(i)assert.equal(w.fromMs,windows[i-1].toMs+1);});
 assert.equal(length,end-start+1);
});
test('one exact midnight is assigned to the new day and invalid or excessive recovery fails closed',()=>{
 const midnight=Date.parse('2026-11-07T00:00:00+07:00');
 assert.deepEqual(splitVietnamDaysV1(midnight,midnight),[{fromMs:midnight,toMs:midnight}]);
 assert.throws(()=>splitVietnamDaysV1(midnight,midnight-1),/WINDOW_INVALID/);
 assert.throws(()=>splitVietnamDaysV1(midnight,midnight+33*day),/DAY_WINDOW_LIMIT/);
});
test('each day exhausts its own page sequence and a later-day failure cannot produce partial success',async()=>{
 const start=Date.parse('2026-11-06T23:59:59+07:00'),end=start+2000,calls=[];
 const pages=async fn=>{const rows=[];for(let page=1;page<=2;page++){const b=await fn(page);if(!b.length)return rows;rows.push(...b);}throw Error('incomplete');};
 const rows=await collectVietnamDayPagesV1(start,end,pages,async(a,b,page)=>{calls.push([a,b,page]);return page===1?[{day:vnDay(a)}]:[];});
 assert.equal(rows.length,2);assert.deepEqual(calls.map(x=>x[2]),[1,2,1,2]);
 await assert.rejects(collectVietnamDayPagesV1(start,end,pages,async(a,b,p)=>{if(vnDay(a)>vnDay(start))throw Error('C04_UPSTREAM_ERROR');return [];}),/C04_UPSTREAM_ERROR/);
});
function source(requestFn){return createC04OrderSourceV1({requestFn,authProvider:async()=>'private-test',appAccessTokenProvider:async()=>'private-app-test'});}
const query={scope,branch,fromMs:Date.parse('2026-11-06T23:59:00+07:00'),toMs:Date.parse('2026-11-07T00:01:00+07:00'),openTransactions:[]};
test('C04 source recovers across midnight against a provider rejecting unsplit day ranges',async()=>{
 const requests=[];
 const result=await source(async input=>{const u=new URL(input.url);requests.push(u);
  if(u.pathname.includes('sale-change-log')){const a=Number(u.searchParams.get('start_date')),b=Number(u.searchParams.get('end_date'));return {status:vnDay(a)===vnDay(b)?200:500,body:{data:[]}};}
  return {status:200,json:{data:[]}};
 })(query);
 assert.equal(result.c04_pages_exhausted,true);assert.equal(result.orders.length,0);
 assert.equal(requests.filter(u=>u.pathname.includes('sale-change-log')).length,2);
});
test('secondary C03 auth failure grants no payment proof and cannot suppress complete C04 observations',async()=>{
 const result=await source(async input=>new URL(input.url).pathname.includes('sale-change-log')?{status:200,body:{data:[]}}:{status:401,json:{}})(query);
 assert.equal(result.c04_pages_exhausted,true);assert.equal(result.c03_pages_exhausted,false);assert.equal(result.c03_error_code,'C03_AUTH_REQUIRED');assert.deepEqual(result.orders,[]);
});
function reprint(){const wall=Date.parse('2026-10-22T12:00:00Z');return {tran_id:'bill-a',log_type:'RE_PRINT_ORDER',created_at:wall/1000,updated_at:wall/1000,start_date:wall-offset,fmt_created_at:'2026-10-22 12:00:00:000001',fmt_updated_at:'2026-10-22 12:00:00:000001',change_data:{...scope,tran_id:'bill-a',tran_no:'123456',origin_tran_id:'',sale_detail:[],sale_payment_method:[]},sale_current:{sale_detail:[],sale_payment_method:[]}};}
test('only an exact empty reprint envelope is inert; item deltas, foreign scope and malformed snapshots remain blocked',()=>{
 assert.equal(isReprintOrderObservationV1(reprint(),scope),true);
 for(const mutate of [r=>r.change_data.sale_detail.push({quantity:1}),r=>r.change_data.store_uid='other',r=>delete r.sale_current]){const raw=reprint();mutate(raw);assert.throws(()=>isReprintOrderObservationV1(raw,scope),/REPRINT_ORDER_REVIEW_REQUIRED/);}
});
const order='00000000-0000-4000-8000-000000000001',cup='00000000-0000-4000-8000-000000000002';
function response(){return {setHeader(){},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}};}
test('restored whole-bill route delegates identity and every cup version to the existing atomic authority',async()=>{
 const calls=[];const bridge=createKdsOperationsBridgeV1({verifyToken:async()=>({id:'42'}),rpc:async(...args)=>{calls.push(args);return {data:{success:true}};}});
 const body={order_id:order,target_status:'prepared',action_key:'idempotent-action-0001',cups:[{cup_id:cup,version:7,status:'pending'}],admin_id:'999'};
 const res=response();await bridge.billTransition({headers:{authorization:'Bearer test'},query:branch,body},res);
 assert.equal(res.statusCode,200);assert.equal(calls[0][0],'cing_kds_transition_bill_v1');assert.equal(calls[0][1].p_admin_id,'42');assert.deepEqual(calls[0][1].p_payload.cups,body.cups);
});
test('duplicated cup IDs or stale-shaped versions never call whole-bill authority',async()=>{
 let calls=0;const bridge=createKdsOperationsBridgeV1({verifyToken:async()=>({id:'42'}),rpc:async()=>{calls++;return {data:{}};}});
 for(const cups of [[{cup_id:cup,version:7,status:'pending'},{cup_id:cup,version:7,status:'pending'}],[{cup_id:cup,version:-1,status:'pending'}]]){
  const res=response();await bridge.billTransition({headers:{authorization:'Bearer test'},query:branch,body:{order_id:order,target_status:'prepared',action_key:'idempotent-action-0001',cups}},res);assert.equal(res.statusCode,400);
 }
 assert.equal(calls,0);
});
