"use strict";
// One bounded source-only audit. No Supabase dependency or DB connection.
(async()=>{
  let requests=0;
  const timeout=setTimeout(()=>{console.log('{"status":"hold","error_code":"KDS_PAID_AUDIT_DEADLINE","database_writes":0}');process.exit(2);},50000);
  try {
    const [from,to]=process.argv.slice(2).map(Date.parse);
    if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<=from||to-from>86400000)throw new Error();
    for(const name of ["KDS_FABI_AUTHORIZATION","KDS_FABI_ACCESS_TOKEN"])if(!(process.env[name]||"").trim())throw new Error();
    const axios=require("axios");
    const {createKdsFabiIpv4TransportV1}=require("../services/kds/cingKdsFabiIpv4TransportV1");
    const {createC03PaidSourceV1}=require("../services/kds/cingKdsC03PaidSourceV1");
    const transport=createKdsFabiIpv4TransportV1({request:input=>{requests++;return axios.request(input);}});
    const collect=createC03PaidSourceV1({requestFn:transport,authProvider:async()=>process.env.KDS_FABI_AUTHORIZATION,
      appAccessTokenProvider:async()=>process.env.KDS_FABI_ACCESS_TOKEN});
    const started=Date.now();
    const result=await collect({scope:{company_uid:"d1627d1b-4ad8-4c2b-86ff-76d70b9b8cad",brand_uid:"d76e55e9-5b31-48da-987d-d096b8a4793c",store_uid:"4aac4b7a-e846-4a40-992a-1cab735c9a4f"},
      branch:{pos_parent:"BRAND-DQIR",pos_id:"109664"},fromMs:from,toMs:to,signal:AbortSignal.timeout(45000)});
    console.log(JSON.stringify({status:"completed",policy:result.policy,requests,duration_ms:Date.now()-started,
      source_invoice_count:result.source_invoice_count,projected_orders:result.orders.length,projected_units:result.created_unit_count,
      c03_pages_exhausted:result.c03_pages_exhausted,c04_pages_exhausted:result.c04_pages_exhausted,
      scope_basis:"operator_configured_branch",attached_modifier_scope:"source_line_totals",
      database_writes:0}));
  } catch(error) {
    const value=String(error?.code||"");console.log(JSON.stringify({status:"hold",requests,
      error_code:/^(KDS_PAID_|C03_|C04_)[A-Z0-9_]+$/.test(value)?value:"KDS_PAID_AUDIT_FAILED",database_writes:0}));process.exitCode=2;
  } finally {clearTimeout(timeout);}
})();
