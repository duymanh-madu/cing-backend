const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(process.argv[2] || path.join(__dirname,'dailyChallengeService.js'), 'utf8');
const entry = {game_key:'chess',enabled:true,challenge_type:'wins',target_value:39,reward_points:127,label:'Admin'};
function harness(options={}) {
  const calls=[], events=[];
  const db = {
    from(table) {
      calls.push(['read',table]);
      const q = {select(){return q},eq(){return q},
        async single(){return {data:{daily_challenge_config:{challenges:options.entries ?? [entry]}},error:options.configError}},
        async maybeSingle(){return {data:options.existing ?? null,error:options.rowError}}};
      return q;
    },
    async rpc(name,args) {
      calls.push([name,args]);
      if (name==='cing_daily_challenge_resolve_admin_v1') return {
        data:options.resolved ?? null,error:options.resolveError};
      return {data:options.award ?? [{applied:true,reward_points:127}],error:options.claimError};
    }
  };
  const context = {module:{exports:{}}, console:{log(){},warn(){}},
    require(name){
      if(name==='../supabase') return db;
      if(name.includes('realtimeEventBus')) return {realtimeEventBus:{publish:e=>events.push(e)}};
      if(name.includes('notificationService')) return {broadcastNotification:async e=>events.push(e)};
      throw Error(name);
    }};
  vm.runInNewContext(source,context);
  return {api:context.module.exports,calls,events};
}
const row={id:'test-id',game_key:'chess',challenge_type:'wins',target_value:39,reward_points:127,completed:false};
test('disabled/missing config returned by DB causes no award',async()=>{
 const h=harness();const r=await h.api.claimChallengeReward({user_id:'test',game_key:'chess',progress:100});
 assert.equal(r.success,false);assert.equal(h.calls.length,1);assert.equal(h.events.length,0);
});
test('missing resolver migration fails closed without fallback',async()=>{
 const h=harness({resolveError:Error('rpc missing')});
 await assert.rejects(h.api.getTodayChallenge('chess'),/rpc missing/);assert.equal(h.calls.length,1);
});
test('configured target 39 is not replaced by default 5',async()=>{
 const h=harness({resolved:row});
 const r=await h.api.claimChallengeReward({game_key:'chess',user_id:'test',progress:5});
 assert.equal(r.success,false);assert.equal(h.calls.length,1);
});
test('Admin reward 127 survives claim and all notifications',async()=>{
 const h=harness({resolved:row});
 const r=await h.api.claimChallengeReward({game_key:'chess',user_id:'test',progress:39});
 assert.equal(r.success,true);assert.equal(r.reward_points,127);assert.equal(h.events.length,3);
 assert(!JSON.stringify(h.events).includes('150'));
});
test('database config-change rejection produces no success notification',async()=>{
 const h=harness({resolved:row,claimError:Error('DAILY_CHALLENGE_CONFIG_CHANGED_RETRY')});
 const r=await h.api.claimChallengeReward({game_key:'chess',user_id:'test',progress:100});
 assert.equal(r.success,false);assert.equal(h.events.length,0);
});
test('replay does not notify or report a second award',async()=>{
 const h=harness({resolved:row,award:[{applied:false}]});
 const r=await h.api.claimChallengeReward({game_key:'chess',user_id:'test',progress:39});
 assert.equal(r.success,false);assert.equal(h.events.length,0);
});
test('database result is the displayed amount, not stale service amount',async()=>{
 const h=harness({resolved:row,award:[{applied:true,reward_points:88}]});
 const r=await h.api.claimChallengeReward({game_key:'chess',user_id:'test',progress:39});
 assert.equal(r.reward_points,88);assert.equal(h.events[0].payload.reward_points,88);
});
test('Revival games cannot use legacy claim RPC',async()=>{
 for(const game_key of ['black-pearl-rush','cing-stack-tower']){
 const h=harness(); const r=await h.api.claimChallengeReward({game_key,progress:999});
 assert.equal(r.code,'REVIVAL_CHALLENGE_V2_AUTHORITY_REQUIRED');assert.equal(h.calls.length,0);
 }
});
test('Admin config read failure stops list and sync',async()=>{
 const h=harness({configError:Error('DB unavailable')});
 await assert.rejects(h.api.getTodayChallenges(),/DB unavailable/);
 await assert.rejects(h.api.syncTodayChallengesFromConfig(),/DB unavailable/);
 assert(h.calls.every(c=>c[0]==='read'));
});
test('disabled and removed games do not resolve or create during sync',async()=>{
 for(const entries of [[],[{...entry,enabled:false}]]){
 const h=harness({entries});assert.equal((await h.api.syncTodayChallengesFromConfig()).length,0);
 assert(h.calls.every(c=>c[0]==='read'));
 }
});
test('invalid values, ambiguous enabled flags and duplicate keys fail closed',async()=>{
 const cases = [
 [{...entry,enabled:'false'}], [{...entry,enabled:undefined}],
 [{...entry,reward_points:0}], [{...entry,reward_points:1.5}],
 [{...entry,target_value:0}], [{...entry,target_value:'39'}],
 [{...entry,reward_points:1000001}], [entry,entry],
 [{...entry,challenge_type:'unknown'}]
 ];
 for(const entries of cases){ const h=harness({entries});
 await assert.rejects(h.api.getTodayChallenges(),/CONFIG_INVALID/);
 assert(h.calls.every(c=>c[0]==='read'));
 }
});
test('legacy sync leaves Revival snapshots untouched',async()=>{
 const h=harness({entries:[{...entry,game_key:'black-pearl-rush'},{...entry,game_key:'cing-stack-tower'}]});
 assert.equal((await h.api.syncTodayChallengesFromConfig()).length,0);
 assert(h.calls.every(c=>c[0]==='read'));
});
