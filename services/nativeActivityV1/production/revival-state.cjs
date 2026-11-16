'use strict';
const {UUID,exact,fail}=require('../common/contract.cjs');
const COLUMNS='id,user_id,game_key,status,finalized_at,abandoned_at';
// Native-only, owner-bound SELECT. No lifecycle transition or local-intent cleanup.
function createRevivalStateReader({db}){
 return async function readOfflineRevivalOperationState({customer,sessionId}){
  const owner=customer?.phone;
  if(typeof owner!=='string'||!/^0[35789][0-9]{8}$/.test(owner)||!UUID.test(sessionId))throw fail('ACTIVITY_INVALID');
  let result;
  try{result=await db.from('cing_offline_revive_sessions').select(COLUMNS,{count:'exact'}).eq('id',sessionId).eq('user_id',owner).limit(2).retry(false).abortSignal(AbortSignal.timeout(7000));}catch{throw fail('ACTIVITY_UNAVAILABLE');}
  if(result?.error||!Array.isArray(result?.data)||!Number.isSafeInteger(result.count)||result.count!==result.data.length||result.count>1)throw fail('ACTIVITY_UNAVAILABLE');
  if(!result.count)throw fail('REVIVAL_SESSION_NOT_FOUND');
  const row=result.data[0];
  if(!exact(row,COLUMNS.split(','))||row.id!==sessionId||row.user_id!==owner||!['black-pearl-rush','cing-stack-tower'].includes(row.game_key)||!['active','revive_pending','finalized','abandoned'].includes(row.status))throw fail('ACTIVITY_UNAVAILABLE');
  const terminal=row.status==='finalized'||row.status==='abandoned';
  const endedAt=row.status==='finalized'?row.finalized_at:row.status==='abandoned'?row.abandoned_at:null;
  if(terminal&&(typeof endedAt!=='string'||!Number.isFinite(Date.parse(endedAt))))throw fail('ACTIVITY_UNAVAILABLE');
  return {session_id:sessionId,game_key:row.game_key,session_status:row.status,owner_confirmed:true,terminal,ended_at:endedAt};
 };
}
module.exports={createRevivalStateReader};
