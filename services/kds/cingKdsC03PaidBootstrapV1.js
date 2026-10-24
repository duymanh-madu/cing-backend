"use strict";
function createC03PaidProductionWorkerV1() {
  // Only called after explicit operator activation. No shared Foodhub variables.
  const axios=require("axios");
  const {createClient}=require("@supabase/supabase-js");
  const {createKdsFabiIpv4TransportV1}=require("./cingKdsFabiIpv4TransportV1");
  const {createC03PaidSourceV1}=require("./cingKdsC03PaidSourceV1");
  const {createC03PaidWorkerV1}=require("./cingKdsC03PaidWorkerV1");
  for(const name of ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","KDS_FABI_AUTHORIZATION","KDS_FABI_ACCESS_TOKEN"])
    if(!(process.env[name]||"").trim())throw new Error("KDS_PAID_CONFIGURATION_MISSING");
  const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const collect=createC03PaidSourceV1({requestFn:createKdsFabiIpv4TransportV1({request:input=>axios.request(input)}),
    authProvider:async()=>process.env.KDS_FABI_AUTHORIZATION,appAccessTokenProvider:async()=>process.env.KDS_FABI_ACCESS_TOKEN});
  const rpc=async(operation,payload,signal)=>{
    const {data,error}=await client.rpc("cing_kds_paid_ingest_p11_v1",{p_operation:operation,p_payload:payload}).abortSignal(signal);
    if(error){const safe=/^KDS_PAID_[A-Z0-9_]+$/.test(error.message||"")?error.message:"KDS_PAID_DATABASE_FAILED";const e=new Error(safe);e.code=safe;throw e;}
    if(!data||typeof data!=="object")throw new Error("KDS_PAID_DATABASE_RECEIPT_INVALID");
    return data;
  };
  return createC03PaidWorkerV1({rpc,collect,report:result=>{
    if(result.status==="completed" && result.outcome==="committed" && (result.inserted_orders>0 || result.changed_orders>0))
      require("./cingKdsChangeEventsV1").notifyKdsChangedV1();
    console.log(JSON.stringify({component:"kds_c03_paid",...result}));
  }});
}
module.exports={createC03PaidProductionWorkerV1};
