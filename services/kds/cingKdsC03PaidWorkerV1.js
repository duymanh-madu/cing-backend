"use strict";
const {randomUUID}=require("node:crypto");
function code(error){return /^(KDS_PAID_|C03_|C04_)[A-Z0-9_]+$/.test(error?.code||"")?error.code:"KDS_PAID_CYCLE_FAILED";}
function createC03PaidWorkerV1({rpc,collect,now=Date.now,schedule=setTimeout,cancel=clearTimeout,report=()=>{},intervalMs=5000,deadlineMs=45000}={}) {
  if(typeof rpc!=="function"||typeof collect!=="function"||!Number.isSafeInteger(intervalMs)||intervalMs<1000||!Number.isSafeInteger(deadlineMs)||deadlineMs<1000||deadlineMs>60000)throw new Error("KDS_PAID_WORKER_CONFIG_INVALID");
  let running=false,closed=false,timer=null,active=null,flight=null;
  async function execute() {
    const started=now(),token=randomUUID(),controller=new AbortController();active=controller;
    const deadline=schedule(()=>controller.abort(),deadlineMs);
    let claimed=false;
    try {
      const claim=await rpc("claim",{token,client_protocol:"c04_order_intake_v1"},controller.signal);
      if(closed||controller.signal.aborted)throw Object.assign(new Error(),{code:"KDS_PAID_DEADLINE"});
      if(claim.outcome!=="claimed")return {status:claim.outcome,database_writes:0};
      claimed=true;
      const result=await collect({scope:claim.scope,branch:claim.branch,fromMs:claim.from_ms,toMs:claim.to_ms,
        knownTransactions:claim.known_transactions,intakeMode:claim.intake_mode||"paid",deadlineAt:started+deadlineMs,signal:controller.signal});
      if(closed||controller.signal.aborted)throw Object.assign(new Error(),{code:"KDS_PAID_DEADLINE"});
      const commit=await rpc("commit",{token,intake_mode:claim.intake_mode||"paid",orders:result.orders,source_invoice_count:result.source_invoice_count,
        requests:result.requests,c03_pages_exhausted:result.c03_pages_exhausted,c04_pages_exhausted:result.c04_pages_exhausted},controller.signal);
      if(!["committed","replayed"].includes(commit?.outcome))throw Object.assign(new Error(),{code:"KDS_PAID_COMMIT_NOT_CONFIRMED"});
      return {status:"completed",...commit,requests:result.requests,duration_ms:now()-started};
    } catch(error) {
      const safe=controller.signal.aborted?"KDS_PAID_DEADLINE":code(error);
      // Release is best-effort; token + server deadline also fence delayed commits.
      // If a commit succeeded but its response was lost, do not overwrite success.
      if(claimed&&!closed)try{await rpc("release",{token,error_code:safe},AbortSignal.timeout(3000));}catch{}
      return {status:"hold",error_code:safe,duration_ms:now()-started};
    } finally {cancel(deadline);active=null;}
  }
  function runOnce(){if(closed)return Promise.resolve({status:"closed"});if(flight)return flight;
    flight=execute().finally(()=>{flight=null;});return flight;}
  async function tick(){if(!running||closed)return;const result=await runOnce();try{report(result);}catch{}
    if(running&&!closed)timer=schedule(tick,intervalMs);}
  return {runOnce,start(){if(!running&&!closed){running=true;timer=schedule(tick,0);}},
    async close(){closed=true;running=false;if(timer!==null)cancel(timer);active?.abort();if(flight)await flight;}};
}
module.exports={createC03PaidWorkerV1};
