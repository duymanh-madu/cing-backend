'use strict';
const {exact,UUID,fail}=require('../common/contract.cjs');
function createContextClient({key,transport=globalThis.fetch}={}){
 if(!/^[a-f0-9]{64}$/.test(key))throw fail('ACTIVITY_CONFIGURATION_INVALID');
 return async function context(proof,write){if(!exact(proof,['sessionId','accessHash'])||!UUID.test(proof.sessionId)||!/^[a-f0-9]{64}$/.test(proof.accessHash)||typeof write!=='boolean')throw fail('ACTIVITY_INVALID');
 const r=await transport('https://cing-native-menu-production.up.railway.app/internal/native-activity-context-v1',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({proof,write}),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});
 const {bounded}=require('../common/bounded.cjs'),p=await bounded(r,8192);
 if(!r.ok)throw fail(['SESSION_INVALID','ACCOUNT_NOT_LINKED','ACCOUNT_BLOCKED','GAME_WRITES_DISABLED','ACTIVITY_DISABLED'].includes(p?.code)?p.code:'ACTIVITY_UNAVAILABLE');
 if(!exact(p,['contract','session_id','link_id','customer_id'])||p.contract!=='native-activity-context-v1'||p.session_id!==proof.sessionId||!UUID.test(p.link_id)||!UUID.test(p.customer_id))throw fail('ACTIVITY_UNAVAILABLE');return p;
 };
}
module.exports={createContextClient};
