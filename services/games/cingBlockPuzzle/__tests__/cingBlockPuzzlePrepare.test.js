const test=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');
const SESSION='11111111-1111-4111-8111-111111111111';
function harness(overrides={}) {
 let verified=0;
 const row={id:SESSION,user_id:'0900000000',game_key:'cing-block-puzzle',seed:42,engine_version:4,rules_version:4,score_version:3,replay_version:5,play_cost:0,status:'active',created_at:'2026-10-23T00:00:00Z',expires_at:'2099-01-01T00:00:00Z',continue_count:0,...overrides};
 const forbidden=()=>assert.fail('Preparation must never perform a financial/score write');
 const mocks={
  './cingBlockPuzzleSessionService':{resolveAuthenticatedUserId:customer=>customer.phone},
  './repositories/cingBlockPuzzleSessionRepository':{getSessionForSubmission:async()=>row,submitSessionAtomic:forbidden,startSessionAtomic:forbidden,purchaseContinueAtomic:forbidden},
  './domain/cingBlockPuzzleReplayAuthority':{verifyReplayAuthority:async args=>{verified++;assert.equal(args.expectedSeed,42);assert.equal(args.requireEnded,true);return {ended:true};}},
 };
 const file=require.resolve('../cingBlockPuzzlePrepareService');delete require.cache[file];const original=Module._load;
 Module._load=function(name,parent,isMain){return mocks[name]||original.call(this,name,parent,isMain);};let service;
 try{service=require(file);}finally{Module._load=original;}
 return {prepare:service.prepareGameplayDecision,count:()=>verified};
}
function input(){return {customer:{phone:'0900000000'},sessionId:SESSION,body:{replay:{seed:42,events:[]}}};}
test('prepare verifies an owned active terminal replay without debit or score submission',async()=>{
 const h=harness();assert.deepEqual(await h.prepare(input()),{prepared:true});assert.equal(h.count(),1);
});
test('prepare rejects another owner before any replay verification',async()=>{
 const h=harness({user_id:'0900000001'});await assert.rejects(h.prepare(input()),error=>error.statusCode===403);assert.equal(h.count(),0);
});
test('prepare rejects expired/submitted sessions without returning readiness',async()=>{
 for(const overrides of [{status:'submitted',submitted_at:'2026-10-23T01:00:00Z',verified_score:160,replay_fingerprint:'a'.repeat(64),move_count:10},{expires_at:'2020-01-01T00:00:00Z'}]) {
  const h=harness(overrides);await assert.rejects(h.prepare(input()),error=>error.statusCode===409);assert.equal(h.count(),0);
 }
});
