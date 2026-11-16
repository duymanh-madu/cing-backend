'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCustomerReadAdapter}=require('./customer-read-adapter.cjs');
const {createCustomerMatchReviewer}=require('./customer-match.cjs');
const row={id:'11111111-1111-4111-8111-111111111111',phone:'0912345678',zalo_id:'123456789'};
function setup(response={data:[row],count:1,error:null}){
 const calls=[];
 const client={from(table){calls.push(['from',table]);const q={
  select(...v){calls.push(['select',...v]);return q;},
  eq(...v){calls.push(['eq',...v]);return q;},
  in(...v){calls.push(['in',...v]);return q;},
  limit(...v){calls.push(['limit',...v]);return q;},
  retry(value){calls.push(['retry',value]);return q;},
  abortSignal(signal){calls.push(['signal',signal]);return q;},
  then(resolve,reject){calls.push(['execute']);return (typeof response==='function'?Promise.resolve().then(response):Promise.resolve(response)).then(resolve,reject);}
 };return q;}};
 return {adapter:createCustomerReadAdapter(client),calls};
}
const reject=run=>assert.rejects(run,e=>e.code==='MATCH_UNAVAILABLE'&&e.message==='MATCH_UNAVAILABLE');
test('only customers and three columns are selected with exact count and two-row bound',async()=>{const {adapter,calls}=setup();assert.deepEqual(await adapter.lookupByZaloId(row.zalo_id),{complete:true,rows:[row]});assert.deepEqual(calls.slice(0,4),[['from','customers'],['select','id,zalo_id,phone',{count:'exact'}],['eq','zalo_id',row.zalo_id],['limit',2]]);assert.deepEqual(calls[4],['retry',false]);assert.ok(calls[5][1] instanceof AbortSignal);});
test('phone lookup checks all three supported formats without raw PostgREST string injection',async()=>{const {adapter,calls}=setup();await adapter.lookupByPhone('+84912345678');assert.deepEqual(calls.find(v=>v[0]==='in'),['in','phone',['0912345678','84912345678','+84912345678']]);});
test('zero rows are complete only with exact zero count',async()=>{const {adapter}=setup({data:[],count:0,error:null});assert.deepEqual(await adapter.lookupByPhone(row.phone),{complete:true,rows:[]});});
test('invalid provider id never creates a database query',async()=>{const {adapter,calls}=setup();for(const id of ['',null,'123,phone.eq.0912345678','a'.repeat(65)])await reject(()=>adapter.lookupByZaloId(id));assert.equal(calls.length,0);});
test('invalid phone never creates a database query',async()=>{const {adapter,calls}=setup();for(const p of ['',null,'091 2345678','0912345678,phone.eq.x'])await reject(()=>adapter.lookupByPhone(p));assert.equal(calls.length,0);});
test('missing, estimated-shaped or inconsistent counts cannot pass',async()=>{for(const count of [undefined,null,'1',-1,1.5,0,2])await reject(()=>setup({data:[row],count,error:null}).adapter.lookupByPhone(row.phone));});
test('more matching rows than the query bound cannot be treated as complete',async()=>{await reject(()=>setup({data:[row],count:3,error:null}).adapter.lookupByPhone(row.phone));});
test('two complete candidates reach matcher and are refused as an identity conflict',async()=>{const second={...row,id:'22222222-2222-4222-8222-222222222222'};const {adapter}=setup({data:[row,second],count:2,error:null});const review=createCustomerMatchReviewer({...adapter,verifyProof:async()=>({verified:true,zaloUserId:row.zalo_id,phone:row.phone})});await assert.rejects(()=>review({miniAccessToken:'fake-access',phoneToken:'fake-phone'}),e=>e.code==='CUSTOMER_CONFLICT');});
test('query failure is generic and never automatically retried',async()=>{const {adapter,calls}=setup(()=>{throw Error('private database diagnostic');});await reject(()=>adapter.lookupByPhone(row.phone));assert.equal(calls.filter(v=>v[0]==='execute').length,1);});
test('database error cannot return data as a success',async()=>{await reject(()=>setup({data:[row],count:1,error:{message:'private'}}).adapter.lookupByPhone(row.phone));});
test('extra profile columns and malformed rows are refused',async()=>{for(const data of [[{...row,name:'private name'}],[{...row,id:'bad'}],[{...row,phone:null}],[{...row,zalo_id:'placeholder'}],[row,row],null])await reject(()=>setup({data,count:Array.isArray(data)?data.length:0,error:null}).adapter.lookupByPhone(row.phone));});
test('unexpected provider or phone rows cannot satisfy a lookup',async()=>{await reject(()=>setup().adapter.lookupByZaloId('987654321'));await reject(()=>setup().adapter.lookupByPhone('0987654321'));});
test('match integration returns internal UUID only, without profile, phone, provider or session',async()=>{const {adapter}=setup();const review=createCustomerMatchReviewer({...adapter,verifyProof:async()=>({verified:true,zaloUserId:row.zalo_id,phone:row.phone})});assert.deepEqual(await review({miniAccessToken:'fake-access',phoneToken:'fake-phone'}),{customerId:row.id,reviewOnly:true,linkCreated:false,sessionIssued:false});});
test('read concurrency is bounded and slots are released on completion',async()=>{const pending=[];const {adapter,calls}=setup(()=>new Promise(resolve=>pending.push(resolve)));const running=Array.from({length:4},()=>adapter.lookupByPhone(row.phone));await new Promise(resolve=>setImmediate(resolve));await reject(()=>adapter.lookupByPhone(row.phone));assert.equal(calls.filter(v=>v[0]==='execute').length,4);for(const resolve of pending)resolve({data:[row],count:1,error:null});await Promise.all(running);});
