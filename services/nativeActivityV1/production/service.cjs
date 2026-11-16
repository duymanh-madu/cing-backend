'use strict';
const {createHmac}=require('node:crypto');
const {EXTRA}=require('../common/customer-services.cjs');
const {exact,validate,WRITES,fail,UUID}=require('../common/contract.cjs');
const TIERS=new Set(['member','loyal','silver','gold','diamond','partner','loyal_partner']);
const BADGES=new Set([...TIERS,'champion','hof_1','hof_2','hof_3','idol','ngoi_sao','minh_tinh']);
function money(v){if(typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v)&&BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER))v=Number(v);if(!Number.isSafeInteger(v)||v<0)throw fail('ACTIVITY_UNAVAILABLE');return v;}
function spending(v){if(typeof v==='number'){if(!Number.isFinite(v)||v<0||v>Number.MAX_SAFE_INTEGER)throw fail('ACTIVITY_UNAVAILABLE');if(Number.isSafeInteger(v))return v;v=String(v);}if(typeof v!=='string'||! /^(0|[1-9][0-9]{0,15})(\.[0-9]{1,40})?$/.test(v)||BigInt(v.split('.')[0])>BigInt(Number.MAX_SAFE_INTEGER))throw fail('ACTIVITY_UNAVAILABLE');return v;}
function name(v){if(typeof v!=='string'||v.length>160||/[\x00-\x1f\x7f]/.test(v))throw fail('ACTIVITY_UNAVAILABLE');return v;}
function avatar(v){if(!v)return '';if(typeof v!=='string'||v.length>100000)return '';if(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v))return v;let url;try{url=new URL(v);}catch{return '';}return url.protocol==='https:'&&!url.username&&!url.password&&!url.hash?v:'';}

function createActivityService({enabled=false,writesEnabled=false,readIdentity,ranking,revival,block,readPolicy,customerSource,key,now=Date.now}={}){
 if(typeof enabled!=='boolean'||typeof writesEnabled!=='boolean'||(writesEnabled&&!enabled))throw fail('ACTIVITY_CONFIGURATION_INVALID');
 if(enabled&&(typeof readIdentity!=='function'||typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key)))throw fail('ACTIVITY_CONFIGURATION_INVALID');
 let active=0;
 const opaque=id=>'public_'+createHmac('sha256',key).update('native-activity-public-id-v1\0'+String(id)).digest('hex').slice(0,32);
 function publicRow(r,own){if(!r||!Number.isInteger(r.rank)||r.rank<1||!r.user_id)throw fail('ACTIVITY_UNAVAILABLE');return {rank:r.rank,user_id:String(r.user_id)===own?'self':opaque(r.user_id),player_name:name(r.player_name||'Cing iu'),avatar:avatar(r.avatar),crm_tier:TIERS.has(r.crm_tier)?r.crm_tier:null,owned_badges:Array.isArray(r.owned_badges)?r.owned_badges.filter(x=>BADGES.has(x)):[],...(r.score!==undefined?{score:money(r.score)}:{total_spent:spending(r.total_spent),total_spent_all_time:spending(r.total_spent_all_time??r.total_spent)})};}
 // A strict allowlist of response identity fields, never a raw transport passthrough.
 function gameReceipt(value,own,depth=0){if(depth>40)throw fail('ACTIVITY_UNAVAILABLE');if(value===null||['number','boolean'].includes(typeof value))return value;if(typeof value==='string'){if(value.length>200000)throw fail('ACTIVITY_UNAVAILABLE');return value;}if(Array.isArray(value)){if(value.length>10000)throw fail('ACTIVITY_UNAVAILABLE');return value.map(v=>gameReceipt(v,own,depth+1));}if(typeof value!=='object')throw fail('ACTIVITY_UNAVAILABLE');const out={};for(const [k,v]of Object.entries(value)){if(['phone','phone_number','zalo_id','zalo_user_id','customer_id','principal_id','accessToken','refreshToken','token'].includes(k))throw fail('ACTIVITY_UNAVAILABLE');if(k==='user_id'){if(String(v)!==own)throw fail('ACTIVITY_UNAVAILABLE');out[k]='self';}else out[k]=gameReceipt(v,own,depth+1);}return out;}
 return {async call(body){
  if(!enabled)throw fail('ACTIVITY_DISABLED');
  if(!exact(body,['customerId','operation','input'])||!UUID.test(body.customerId))throw fail('ACTIVITY_INVALID');
  const input=validate(body.operation,body.input),operation=body.operation;
  if(operation==='game.capability')throw fail('ACTIVITY_INVALID');
   if(WRITES.has(operation)&&!writesEnabled)throw fail('GAME_WRITES_DISABLED');
  if(active>=2)throw fail('TRY_LATER');active++;
  try{
   const before=await readIdentity({customerId:body.customerId,requireGameMembership:!EXTRA.has(operation)}),identity=before.identity;
   if(!identity||identity.customerId!==body.customerId||!/^0[35789][0-9]{8}$/.test(identity.phone))throw fail('ACTIVITY_IDENTITY_CONFLICT');
   const customer={phone:identity.phone},owner=identity.phone;let data;
   if(EXTRA.has(operation)){if(!customerSource)throw fail('ACTIVITY_UNAVAILABLE');data=await customerSource.read(operation,input,identity);}
   else if(operation==='hall.read'){
    const policy=await readPolicy();if(!policy||!policy.leaderboard_config)throw fail('ACTIVITY_UNAVAILABLE');
    if(input.period==='custom'&&policy.leaderboard_config.spending?.custom?.enabled===false)throw fail('BOARD_DISABLED');
    const range=input.period==='custom'?{from:policy.custom_leaderboard_from,to:policy.custom_leaderboard_to}:{};
    if(input.period==='custom'&&(!range.from||!Number.isFinite(Date.parse(range.from))))throw fail('BOARD_DISABLED');
    const rows=await ranking.top({period:input.period,limit:10,...range}),self=await ranking.self(owner,{period:input.period,...range});
    if(!Array.isArray(rows)||rows.length>10||new Set(rows.map(r=>String(r.user_id))).size!==rows.length)throw fail('ACTIVITY_UNAVAILABLE');
    const display=rows.map(r=>publicRow(r,owner)),own=self?.rank?publicRow(self,owner):null;let budget=320000;for(const row of [...display,...(own?[own]:[])]){if(row.avatar.startsWith('data:')){if(row.avatar.length>budget)row.avatar='';else budget-=row.avatar.length;}}
    data={period:input.period,rows:display,self:own,customEnabled:policy.leaderboard_config.spending?.custom?.enabled!==false,customName:typeof policy.custom_leaderboard_name==='string'?name(policy.custom_leaderboard_name):'Sự kiện',customRange:{from:policy.custom_leaderboard_from||null,to:policy.custom_leaderboard_to||null},rewardsConfig:projectRewards(policy.leaderboard_config.spending),rankCoverage:'canonical-existing-board'};
   }else if(operation==='game.board'){const rows=await ranking.game(input.gameKey,{limit:10,weekly:true,strictPlayerRead:true});if(!Array.isArray(rows)||rows.length>10)throw fail('ACTIVITY_UNAVAILABLE');data={gameKey:input.gameKey,rows:rows.map(r=>publicRow(r,owner))};if(input.includeRewards===true){try{const policy=await readPolicy();Object.assign(data,projectGameRewards(policy?.leaderboard_config?.games?.[input.gameKey]));}catch{Object.assign(data,{rewardsEnabled:false,rewards:[]});}}}
   else if(operation==='game.policy')data=gameReceipt(await ranking.policy(),owner);
   else if(operation==='revival.state')data=gameReceipt(await revival.readOfflineRevivalOperationState({customer,...input}),owner);
   else if(operation==='revival.balance')data=gameReceipt(await revival.getOfflineReviveCreditBalance({customer}),owner);
   else if(operation==='revival.start')data=gameReceipt(await revival.startOfflineRevival({customer,...input}),owner);
   else if(operation==='revival.recover')data=gameReceipt(await revival.recoverOfflineRevival({customer,...input}),owner);
   else if(operation==='revival.pending')data=gameReceipt(await revival.enterOfflineRevivePending({customer,...input}),owner);
   else if(operation==='revival.apply')data=gameReceipt(await revival.purchaseOfflineRevival({customer,...input}),owner);
   else if(operation==='revival.finalize')data=gameReceipt(await revival.finalizeOfflineRevival({customer,...input,playerName:before.snapshot?.sections?.profile?.name||'Cing iu',avatar:null}),owner);
   else if(operation==='revival.abandon')data=gameReceipt(await revival.abandonOfflineRevival({customer,...input}),owner);
   else if(operation==='block.start')data=gameReceipt(await block.startGameplaySession({customer,requestId:input.requestId}),owner);
   else if(operation==='block.progress'){
    const p=await block.getWeeklyProgress({customer});data={...p,self:{...p.self,user_id:'self'},rivals:p.rivals.map(r=>({...r,user_id:opaque(r.user_id),player_name:name(r.player_name),avatar:avatar(r.avatar)}))};
   }else {const f={'block.prepare':block.prepareGameplayDecision,'block.submit':block.submitGameplaySession,'block.continue':block.purchaseVersionedGameplayContinue}[operation];data=gameReceipt(await f({customer,sessionId:input.sessionId,body:{replay:input.replay,...(input.requestId?{request_id:input.requestId}:{})}}),owner);}
   const after=await readIdentity({customerId:body.customerId,requireGameMembership:!EXTRA.has(operation)});if(after.identity?.customerId!==identity.customerId||after.identity?.phone!==owner||after.identity?.zaloId!==identity.zaloId)throw fail('ACTIVITY_IDENTITY_CONFLICT');
   return {contract:'native-activity-v1',operation,observedAt:new Date(now()).toISOString(),data};
  }finally{active--;}
 }};
}
function projectRewards(value){const result={};for(const period of ['weekly','monthly','yearly','alltime','custom']){const p=value?.[period];if(p===undefined)continue;if(!p||typeof p.enabled!=='boolean'||(p.rewards!==undefined&&!Array.isArray(p.rewards))||(p.rewards?.length??0)>10)throw fail('ACTIVITY_UNAVAILABLE');result[period]={enabled:p.enabled,rewards:(p.enabled===true?(p.rewards??[]):[]).map(r=>({points:money(r.points??0),game_plays:money(r.game_plays??0)}))};}return result;}
function projectGameRewards(cfg){
 const rewardsEnabled=cfg?.enabled===true;
 const raw=rewardsEnabled&&Array.isArray(cfg.rewards)?cfg.rewards:[];
 if(raw.length>100)throw fail('ACTIVITY_UNAVAILABLE');
 return {rewardsEnabled,rewards:raw.map((r,i)=>({rank:money(r.rank??i+1),points:money(r.points??0),game_plays:money(r.game_plays??0),label:name(r.label??`Hạng ${i+1}`)}))};
}
module.exports={createActivityService,projectRewards,projectGameRewards};
