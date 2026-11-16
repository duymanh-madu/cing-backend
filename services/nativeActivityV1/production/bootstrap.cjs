'use strict';
const {createHandler}=require('../common/http.cjs');
const {exact,UUID,fail}=require('../common/contract.cjs');
function createMiddleware(env=process.env,deps={}){
 for(const n of ['CING_NATIVE_ACTIVITY_ENABLED','CING_NATIVE_GAME_WRITES_ENABLED'])if(env[n]!==undefined&&!['true','false'].includes(env[n]))throw fail('ACTIVITY_CONFIGURATION_INVALID');
 const enabled=env.CING_NATIVE_ACTIVITY_ENABLED==='true',writesEnabled=env.CING_NATIVE_GAME_WRITES_ENABLED==='true';if(writesEnabled&&!enabled)throw fail('ACTIVITY_CONFIGURATION_INVALID');
 if(!enabled){const h=createHandler({internal:true});return async(req,res,next)=>{if(!await h(req,res))next();};}
 const key=env.CING_NATIVE_ACTIVITY_BRIDGE_KEY,contextKey=env.CING_NATIVE_ACTIVITY_CONTEXT_BRIDGE_KEY;if(!/^[a-f0-9]{64}$/.test(contextKey)||contextKey===key||Object.entries(env).some(([k,v])=>k!=='CING_NATIVE_ACTIVITY_CONTEXT_BRIDGE_KEY'&&/BRIDGE_KEY$/.test(k)&&v===contextKey))throw fail('ACTIVITY_CONFIGURATION_INVALID');if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key)||Object.entries(env).some(([k,v])=>k!=='CING_NATIVE_ACTIVITY_BRIDGE_KEY'&&/BRIDGE_KEY$/.test(k)&&v===key))throw fail('ACTIVITY_CONFIGURATION_INVALID');
 const db=deps.db||require('../../../supabase'),reader=deps.reader||require('./identity.cjs').createIdentityReader({db,normalizePhone:require('../../../utils/phoneIdentity').normalizePhone});
 const ranking=deps.ranking||require('../../leaderboardService'),enrich=deps.enrich||require('../../leaderboardBadgeProjectionService').enrichLeaderboardRowsWithBadges;
 const revival=deps.revival||{...require('../../games/revival/cingOfflineReviveService'),readOfflineRevivalOperationState:require('./revival-state.cjs').createRevivalStateReader({db})};
 const block=deps.block||Object.assign({},...['cingBlockPuzzleSessionService','cingBlockPuzzlePrepareService','cingBlockPuzzleSubmitService','cingBlockPuzzleContinueDispatchService','cingBlockPuzzleWeeklyProgressService'].map(n=>require('../../games/cingBlockPuzzle/'+n)));
 const readPolicy=deps.readPolicy||async function(){const r=await db.from('app_configs').select('leaderboard_config,custom_leaderboard_name,custom_leaderboard_from,custom_leaderboard_to').eq('id',1).single();if(r.error||!r.data)throw fail('ACTIVITY_UNAVAILABLE');return r.data;};
 const customerSource=deps.customerSource||require('./customer-source.cjs').createCustomerReadSource({db,giftReadEnabled:env.CING_GAME_ECONOMY_V2_HTTP_ENABLED==='true',wallet:()=>require('../../wallet/cingWalletReadService'),daily:()=>require('../../dailyMissionService')});
 const service=require('./service.cjs').createActivityService({enabled,writesEnabled,key,customerSource,readIdentity:reader.readInternal,revival,block,readPolicy,ranking:{top:async input=>enrich(await ranking.getTopSpenders(input)),self:ranking.getUserRank,game:async(...args)=>enrich(await ranking.getGameLeaderboard(...args)),policy:deps.gamePolicy||require('../../gameService').getGameEconomyPolicies}});
 const context=deps.context||require('./context.cjs').createContextClient({key:contextKey,transport:deps.transport});
 const h=createHandler({enabled:true,internal:true,key,service:{async call(body){if(!exact(body,['requestId','proof','operation','input'])||!UUID.test(body.requestId))throw fail('ACTIVITY_INVALID');const {requestId,proof,operation,input}=body;require('../common/contract.cjs').validate(operation,input);const write=require('../common/contract.cjs').WRITES.has(operation);const before=await context(proof,write),customerId=before.customer_id;const payload=await service.call({customerId,operation,input});const after=await context(proof,write);if(before.customer_id!==after.customer_id||before.link_id!==after.link_id)throw fail('SESSION_INVALID');return {requestId,customerId,payload};}}});
 return async(req,res,next)=>{if(!await h(req,res))next();};
}
module.exports={createMiddleware};
