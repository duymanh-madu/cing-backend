const test = require('node:test');
const assert = require('node:assert/strict');
const {createReplayVerificationCache} = require('../performance/replayVerificationCache');
const {createSessionRead,resolveSessionRead} = require('../performance/requestSessionRead');
const args = {transcript:{seed:42,events:[{type:'move',row:0,col:0}]},expectedSeed:42,engineVersion:4,rulesVersion:4,scoreVersion:3,replayVersion:5,requireEnded:true};
test('verification coalesces in-flight requests but never mutates financial state',async()=>{
  let calls=0;let release;const gate=new Promise(resolve=>release=resolve);
  const verify=createReplayVerificationCache(async()=>{calls++;await gate;return Object.freeze({score:42});});
  const a=verify(args);const b=verify(structuredClone(args));await Promise.resolve();assert.equal(calls,1);
  release();assert.deepEqual(await a,await b);await verify(args);assert.equal(calls,1);
});
test('cache cannot reuse results across seed/version/terminal requirements or raw unknown fields',async()=>{
  let calls=0;const verify=createReplayVerificationCache(async()=>({score:++calls}));
  await verify(args);
  for(const variant of [{...args,expectedSeed:43},{...args,engineVersion:3},{...args,requireEnded:false},{...args,transcript:{...args.transcript,injected:true}},{...args,transcript:{...args.transcript,events:[{...args.transcript.events[0],injected:true}]}}]) await verify(variant);
  assert.equal(calls,6);
});
test('rejected results are not cached; TTL and bounded eviction are enforced',async()=>{
  let time=0;let calls=0;
  const verify=createReplayVerificationCache(async()=>{calls++;if(calls===1)throw Error('retry');return {score:calls};},{now:()=>time,ttlMs:10,maxEntries:1});
  await assert.rejects(verify(args));await verify(args);await verify(args);assert.equal(calls,2);
  time=11;await verify(args);assert.equal(calls,3);
  await verify({...args,expectedSeed:43});await verify(args);assert.equal(calls,5);
});
test('a request-local read cannot be supplied by JSON or used for a different session',()=>{
  const row={id:'a',user_id:'owner',continue_count:0};const token=createSessionRead(row);row.user_id='changed';
  assert.equal(resolveSessionRead(token,'a').user_id,'owner');
  assert.equal(resolveSessionRead(token,'b'),null);assert.equal(resolveSessionRead(JSON.parse('{}'),'a'),null);
});
