const test=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');
const path=require('node:path');
const SESSION='11111111-1111-4111-8111-111111111111';const REQUEST='22222222-2222-4222-8222-222222222222';
function harness({owner='0900000000',failAtomic=false}={}) {
 let reads=0,commits=0;
 const row={id:SESSION,user_id:owner,game_key:'cing-block-puzzle',seed:42,engine_version:4,rules_version:4,score_version:3,replay_version:5,status:'active',expires_at:'2099-01-01T00:00:00Z',continue_count:0};
 const receipt={purchase_id:REQUEST,session_id:SESSION,continue_index:1,continue_count:1,credit_cost:1,credit_transaction_id:'1',balance_before:5,balance_after:4,verified_replay_fingerprint:'a'.repeat(64),created_at:'2026-10-23T00:00:00Z',idempotent:false};
 const mocks={
  './cingBlockPuzzleSessionService':{resolveAuthenticatedUserId:customer=>customer.phone},
  './repositories/cingBlockPuzzleSessionRepository':{getSessionForSubmission:async()=>{reads++;return row;}},
  './domain/cingBlockPuzzleReplayAuthority':{verifyReplayAuthority:async()=>({continues_used:0,replay_fingerprint:'a'.repeat(64)})},
  './repositories/cingBlockPuzzleV5ReviveRepository':{applyV5ReviveAtomic:async()=>{commits++;if(failAtomic)throw Error('INSUFFICIENT_CREDIT');return receipt;}},
  './cingBlockPuzzleContinueService':{purchaseGameplayContinue:()=>assert.fail('wrong financial contract')},
 };
 const original=Module._load;const files=['../cingBlockPuzzleContinueDispatchService.js','../cingBlockPuzzleV5ReviveService.js'].map(file=>path.resolve(__dirname,file));
 for(const file of files) delete require.cache[file];
 Module._load=function(name,parent,isMain){return mocks[name] || original.call(this,name,parent,isMain);};
 let dispatch,service;
 try {dispatch=require(files[0]).purchaseVersionedGameplayContinue;service=require(files[1]).purchaseV5GameplayRevive;}
 finally {Module._load=original;}
 return {dispatch,service,counts:()=>({reads,commits})};
}
const input=()=>({customer:{phone:'0900000000'},sessionId:SESSION,body:{request_id:REQUEST,replay:{events:[]}}});
test('V5 dispatch + purchase perform one session read and one atomic commit',async()=>{
 const h=harness();const receipt=await h.dispatch(input());assert.equal(receipt.balance_after,4);assert.deepEqual(h.counts(),{reads:1,commits:1});
});
test('direct service invocation still reads authority; client JSON cannot fabricate a row',async()=>{
 const h=harness();await h.service({...input(),sessionRead:{id:SESSION,user_id:'0900000000'}});assert.deepEqual(h.counts(),{reads:1,commits:1});
});
test('wrong owner never reaches debit and atomic rejection never returns success',async()=>{
 const other=harness({owner:'0900000001'});await assert.rejects(other.dispatch(input()),error=>error.statusCode===403);assert.equal(other.counts().commits,0);
 const failed=harness({failAtomic:true});await assert.rejects(failed.dispatch(input()));assert.deepEqual(failed.counts(),{reads:1,commits:1});
});
