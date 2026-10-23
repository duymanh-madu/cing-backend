'use strict';const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createKdsOperationsStreamV1,snapshotDigestV1}=require('../cingKdsOperationsStreamV1');
const {notifyKdsChangedV1,subscribeKdsChangedV1}=require('../cingKdsChangeEventsV1');
function connection(){const req=new EventEmitter(),res=new EventEmitter();let data='';res.headersSent=false;res.status=()=>res;res.setHeader=()=>{};res.flushHeaders=()=>{res.headersSent=true;};res.write=s=>{data+=s;return true;};res.end=()=>{};res.json=x=>{data+=JSON.stringify(x);res.headersSent=true;};return {req,res,get data(){return data;}};}
const tick=()=>new Promise(r=>setImmediate(r));
test('stream emits only business change, minute/SLA change, or heartbeat; cleans up listener/timer',async()=>{
 let notify,periodic,removed=0,cancelled=0;let version=1;
 const x=connection();const stream=createKdsOperationsStreamV1({snapshot:async()=>({version,sampled_at:Date.now(),source_health:{last_success_at:Date.now()}}),
 subscribe:fn=>{notify=fn;return()=>removed++;},schedule:fn=>{periodic=fn;return 7;},cancel:()=>cancelled++});
 await stream(x.req,x.res);await periodic();assert.equal((x.data.match(/event: snapshot/g)||[]).length,1);assert.match(x.data,/event: heartbeat/);
 version=2;await notify();assert.equal((x.data.match(/event: snapshot/g)||[]).length,2);
 x.res.emit('close');await notify();assert.equal(removed,1);assert.equal(cancelled,1);
});
test('authorization failure exposes no data or private error and closes subscription',async()=>{
 const x=connection();let removed=0;await createKdsOperationsStreamV1({snapshot:async()=>{throw Error('secret');},subscribe:()=>()=>removed++,schedule:()=>1,cancel:()=>{}})(x.req,x.res);
 assert.doesNotMatch(x.data,/secret|event: snapshot/);assert.match(x.data,/STREAM_UNAVAILABLE/);assert.equal(removed,1);
});
test('revocation or source failure after initial data sends hold, removes listener and closes stream',async()=>{
 const x=connection();let periodic,fail=false,removed=0;await createKdsOperationsStreamV1({snapshot:async()=>{if(fail)throw Error();return {version:1};},
 subscribe:()=>()=>removed++,schedule:fn=>{periodic=fn;return 1;},cancel:()=>{}})(x.req,x.res);
 fail=true;await periodic();assert.match(x.data,/event: hold/);assert.equal(removed,1);
});
test('invalidation during a read is coalesced, never overlapping or lost',async()=>{
 const x=connection();let notify,resolve,calls=0,concurrent=0,max=0;
 const first=createKdsOperationsStreamV1({snapshot:async()=>{calls++;max=Math.max(max,++concurrent);if(calls===1)await new Promise(r=>resolve=r);concurrent--;return {calls};},
 subscribe:fn=>{notify=fn;return()=>{};},schedule:()=>1,cancel:()=>{}})(x.req,x.res);
 notify();notify();resolve();await first;assert.equal(calls,2);assert.equal(max,1);x.res.emit('close');
});
test('backpressure waits for drain without disconnecting or duplicating snapshot',async()=>{
 const x=connection();let writes=0,removed=0;const original=x.res.write;
 x.res.write=value=>{original(value);return ++writes!==1;};
 const pending=createKdsOperationsStreamV1({snapshot:async()=>({v:1}),subscribe:()=>()=>removed++,schedule:()=>1,cancel:()=>{}})(x.req,x.res);
 await tick();assert.equal(removed,0);x.res.emit('drain');await pending;
 assert.equal((x.data.match(/event: snapshot/g)||[]).length,1);assert.equal(removed,0);x.res.emit('close');assert.equal(removed,1);
});
test('disconnect while waiting for drain cleans pending listeners',async()=>{
 const x=connection();x.res.write=()=>false;
 const pending=createKdsOperationsStreamV1({snapshot:async()=>({v:1}),subscribe:()=>()=>{},schedule:()=>1,cancel:()=>{}})(x.req,x.res);
 await tick();x.res.emit('close');await pending;assert.equal(x.res.listenerCount('drain'),0);
});
test('actual HTTP stream stays open with a snapshot larger than writable high-water mark',async()=>{
 const http=require('node:http');let wroteFalse=false,ended=false;
 const server=http.createServer((req,res)=>{
  res.status=()=>res;res.json=x=>res.end(JSON.stringify(x));const write=res.write.bind(res);
  res.write=value=>{const accepted=write(value);if(!accepted)wroteFalse=true;return accepted;};
  void createKdsOperationsStreamV1({snapshot:async()=>({rows:Array.from({length:1000},(_,id)=>({id,name:'Large list '.repeat(30)}))}),subscribe:()=>()=>{},intervalMs:30})(req,res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let request;const response=await new Promise(resolve=>{request=http.get({host:'127.0.0.1',port:server.address().port,path:'/'},resolve);});
 response.resume();response.on('end',()=>ended=true);
 await new Promise(resolve=>setTimeout(resolve,130));
 assert.equal(wroteFalse,true);assert.equal(ended,false);
 request.destroy();await new Promise(resolve=>server.close(resolve));
});
test('internal event bus carries no customer payload and unsubscribes',()=>{
 let calls=0;const off=subscribeKdsChangedV1(()=>calls++);notifyKdsChangedV1();off();notifyKdsChangedV1();assert.equal(calls,1);
});
test('digest ignores health/sample jitter and fractional elapsed minutes',()=>{
 assert.equal(snapshotDigestV1({sampled_at:1,source_health:1,preparation:[{elapsed_minutes:1.1,status:'pending'}]}),snapshotDigestV1({sampled_at:2,source_health:2,preparation:[{elapsed_minutes:1.9,status:'pending'}]}));
 assert.notEqual(snapshotDigestV1({preparation:[{elapsed_minutes:1.1}]}),snapshotDigestV1({preparation:[{elapsed_minutes:2.1}]}));
});
