const test=require('node:test');const assert=require('node:assert/strict');
const {measureStage,blockPuzzleTiming}=require('../performance/requestTiming');
function request(name){return new Promise((resolve,reject)=>{
 const headers={};const res={setHeader:(key,value)=>headers[key]=value,json:body=>({body,headers})};
 blockPuzzleTiming({},res,()=>{measureStage(name,async()=>{await Promise.resolve();return 1;}).then(()=>resolve(res.json({success:true})),reject);});
});}
test('timing keeps concurrent request stages isolated and does not alter response data',async()=>{
 const [a,b]=await Promise.all([request('session_read'),request('transaction')]);
 assert.deepEqual(a.body,{success:true});assert.match(a.headers['Server-Timing'],/app;dur=/);assert.match(a.headers['Server-Timing'],/session_read;dur=/);assert.doesNotMatch(a.headers['Server-Timing'],/transaction/);
 assert.match(b.headers['Server-Timing'],/transaction;dur=/);assert.doesNotMatch(b.headers['Server-Timing'],/session_read/);
});
test('stage measurement preserves failures and works without an HTTP context',async()=>{
 await assert.rejects(measureStage('transaction',async()=>{throw Error('same-error');}),/same-error/);
 assert.equal(await measureStage('read',()=>42),42);
});
