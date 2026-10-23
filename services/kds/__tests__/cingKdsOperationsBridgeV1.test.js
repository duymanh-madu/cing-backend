"use strict";
const test=require("node:test");const assert=require("node:assert/strict");
const {createKdsOperationsBridgeV1}=require("../cingKdsOperationsBridgeV1");
const branch={pos_parent:"BRAND-DQIR",pos_id:"109664"};
const now="2026-10-23T01:10:00.000Z";
const fixture=()=>({branch,sampled_at:now,capabilities:{transitions_enabled:true},
  policy:{...branch,warning_minutes:5,critical_minutes:10,enabled:true},
  orders:[{id:"order-1",...branch,tran_no:"test-invoice",started_at:"2026-10-23T01:00:00.000Z",
    payment_verification:"verified",ingestion_status:"processed",conflict_status:"clear",
    cups:[{id:"00000000-0000-4000-8000-000000000001",item_name:"Test drink",item_group:"Test group",status:"pending",version:3}]}]});
function req(body={}){return {headers:{authorization:"Bearer test-token"},query:branch,body};}
async function call(handler,request){let status,body;const response={setHeader(){},status(s){status=s;return this;},json(b){body=b;return b;}};await handler(request,response);return {status,body};}
test("invalid/missing JWT never touches DB",async()=>{
  let calls=0;const handlers=createKdsOperationsBridgeV1({rpc:()=>{calls++;},verifyToken:()=>{throw Error("private");}});
  assert.equal((await call(handlers.snapshot,{headers:{},query:branch})).status,401);
  assert.equal((await call(handlers.snapshot,req())).status,401);assert.equal(calls,0);
});
test("actor comes from verified JWT ID, not body or stale role; DB denial is preserved",async()=>{
  const handlers=createKdsOperationsBridgeV1({verifyToken:()=>({id:7,role:"super_admin"}),rpc:async(name,args)=>{
    assert.equal(args.p_admin_id,"7");assert.equal(args.p_operation,"snapshot");assert.equal(args.p_payload.actor_id,undefined);
    return {error:{message:"KDS_OPS_FORBIDDEN"}};
  }});
  const r=await call(handlers.snapshot,req({actor_id:"attacker",role:"super_admin"}));assert.equal(r.status,403);
});
test("gate closed returns HOLD, no empty-success snapshot or private errors",async()=>{
  for(const code of ["KDS_OPS_READ_DISABLED","KDS_OPS_POLICY_REQUIRED","KDS_OPS_SNAPSHOT_LIMIT","private db key=secret"]){
    const h=createKdsOperationsBridgeV1({verifyToken:()=>({id:1}),rpc:async()=>({error:{message:code}})});
    const r=await call(h.snapshot,req());assert.equal(r.body.success,false);
    assert.ok(!JSON.stringify(r).includes("secret"));assert.ok(r.status>=400);
  }
});
test("snapshot produces versioned queues and SLA alerts in one read",async()=>{
  const h=createKdsOperationsBridgeV1({verifyToken:()=>({id:1}),clock:()=>now,rpc:async()=>({data:fixture()})});
  const r=await call(h.snapshot,req());assert.equal(r.status,200);
  assert.equal(r.body.preparation[0].version,3);assert.equal(r.body.preparation[0].severity,"critical");
  assert.equal(r.body.alerts.length,1);assert.equal(r.body.capabilities.transitions_enabled,true);
});
test("wrong branch RPC result holds",async()=>{
  const data=fixture();data.branch={...branch,pos_id:"999"};
  const h=createKdsOperationsBridgeV1({verifyToken:()=>({id:1}),rpc:async()=>({data})});
  assert.equal((await call(h.snapshot,req())).status,503);
});
test("transition validates version/idempotency and excludes caller actor",async()=>{
  let args;const h=createKdsOperationsBridgeV1({verifyToken:()=>({id:"trusted"}),rpc:async(n,a)=>{args=a;return {data:{outcome:"applied"}};}});
  const body={cup_id:"00000000-0000-4000-8000-000000000001",expected_version:3,target_status:"prepared",action_key:"action-key-test-123",actor_id:"forged"};
  assert.equal((await call(h.transition,req(body))).status,200);
  assert.equal(args.p_admin_id,"trusted");assert.equal(args.p_payload.actor_id,undefined);
  assert.equal((await call(h.transition,req({...body,expected_version:-1}))).status,400);
});
test("conflicts are HTTP 409 and never expose internal payload",async()=>{
  const h=createKdsOperationsBridgeV1({verifyToken:()=>({id:1}),rpc:async()=>({error:{message:"KDS_OPS_VERSION_CONFLICT"}})});
  const b={cup_id:"00000000-0000-4000-8000-000000000001",expected_version:1,target_status:"served",action_key:"action-key-test-123"};
  assert.equal((await call(h.transition,req(b))).status,409);
});
test("policy rejects invalid boundaries before DB",async()=>{
  let calls=0;const h=createKdsOperationsBridgeV1({verifyToken:()=>({id:1}),rpc:async()=>{calls++;return {data:{saved:true}};}});
  assert.equal((await call(h.policy,req({warning_minutes:5,critical_minutes:5}))).status,400);
  assert.equal(calls,0);
});
