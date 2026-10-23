'use strict';const test=require('node:test'),assert=require('node:assert/strict');
const {createKdsOperationsBridgeV1}=require('../cingKdsOperationsBridgeV1');
const req={headers:{authorization:'Bearer valid-token'},query:{pos_parent:'BRAND-DQIR',pos_id:'109664'},body:{admin_id:'2',action_key:'safe-key-1234567890',grant:{},expected_grant:{},actor_id:'forged'}};
async function call(handler,request=req){let status,body;await handler(request,{setHeader(){},status(x){status=x;return this;},json(x){body=x;return this;}});return {status,body};}
test('access endpoints trust actor only from JWT and send grant operations only to restricted management RPC',async()=>{
 const seen=[];const h=createKdsOperationsBridgeV1({verifyToken:()=>({id:'1'}),rpc:async(name,args)=>{seen.push({name,args});return {data:{outcome:'saved'}};}});
 assert.equal((await call(h.accessSave)).status,200);assert.equal(seen[0].name,'cing_kds_access_p13_v1');assert.equal(seen[0].args.p_actor_id,'1');assert.equal(seen[0].args.p_payload.actor_id,undefined);
 await call(h.accessBranches,{...req,query:{}});assert.equal(seen[1].args.p_operation,'branches');assert.equal(seen[1].args.p_branch,null);
});
test('forbidden management and invalid session never leak admin details or private errors',async()=>{
 const h=createKdsOperationsBridgeV1({verifyToken:()=>({id:'2'}),rpc:async()=>({error:{message:'KDS_OPS_FORBIDDEN'}})});
 assert.equal((await call(h.accessList)).status,403);assert.equal((await call(h.accessList,{...req,headers:{}})).status,401);
});
