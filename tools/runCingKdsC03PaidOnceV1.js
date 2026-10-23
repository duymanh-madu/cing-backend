"use strict";
// Writes canonical KDS rows only when BOTH one-shot confirmation and DB ingestion
// control are enabled. Does not enable P9, write grants or the background worker.
if(process.env.CING_KDS_C03_PAID_CONFIRM!=="CING_KDS_C03_PAID_RUN_ONCE_V1") {
  console.log('{"status":"hold","error_code":"KDS_PAID_CONFIRMATION_REQUIRED"}');process.exitCode=2;
} else {
  (async()=>{
    const {createC03PaidProductionWorkerV1}=require("../services/kds/cingKdsC03PaidBootstrapV1");
    const worker=createC03PaidProductionWorkerV1();
    try {const result=await worker.runOnce();console.log(JSON.stringify(result));if(result.status!=="completed")process.exitCode=2;}
    finally {await worker.close();}
  })().catch(()=>{console.log('{"status":"hold","error_code":"KDS_PAID_CONFIGURATION_FAILED"}');process.exitCode=2;});
}
