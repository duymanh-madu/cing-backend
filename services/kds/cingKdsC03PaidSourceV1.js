"use strict";
const {createFabiC03HttpClientV1}=require("./cingKdsFabiC03HttpClientV1");
const {createFabiC04HttpClientV1}=require("./cingKdsFabiC04HttpClientV1");
const {projectC03PaidOrdersV1}=require("./cingKdsC03PaidProjectionV1");
const {createC04OrderSourceV1}=require("./cingKdsC04OrderSourceV1");
function fail(code){const e=new Error(code);e.code=code;throw e;}
function createC03PaidSourceV1({requestFn,authProvider,appAccessTokenProvider,maxPages=20}={}) {
  if(typeof requestFn!=="function"||!Number.isSafeInteger(maxPages)||maxPages<2||maxPages>100)fail("KDS_PAID_SOURCE_CONFIG_INVALID");
  return async function collect({scope,branch,fromMs,toMs,knownTransactions=[],intakeMode="paid",deadlineAt,signal}={}) {
    if(!Number.isSafeInteger(fromMs)||!Number.isSafeInteger(toMs)||fromMs<0||toMs<fromMs)fail("KDS_PAID_WINDOW_INVALID");
    if(!["paid","c04_order_intake_v1"].includes(intakeMode))fail("KDS_PAID_INTAKE_MODE_INVALID");
    if(intakeMode==="c04_order_intake_v1")return createC04OrderSourceV1({requestFn,authProvider,appAccessTokenProvider,maxPages})({scope,branch,fromMs,toMs,knownTransactions,deadlineAt,signal});
    let requests=0;
    const request=async input=>{
      if(signal?.aborted)fail("KDS_PAID_DEADLINE");
      const url=new URL(input.url);
      if(url.pathname==="/api/reports_v1/v3/pos-cms/report/sale-by-date")url.searchParams.set("csv","1");
      requests++;
      // Caller deadline and client per-request deadline must both abort transport.
      const combined=signal?AbortSignal.any([signal,input.signal].filter(Boolean)):input.signal;
      return requestFn({...input,url:url.toString(),signal:combined});
    };
    const c03=createFabiC03HttpClientV1({requestFn:request,authProvider,appAccessTokenProvider,requestTimeoutMs:10000});
    const c04=createFabiC04HttpClientV1({requestFn:request,authProvider,appAccessTokenProvider,requestTimeoutMs:10000});
    async function pages(fetchPage) {
      const rows=[],seen=new Set();
      for(let page=1;page<=maxPages;page++) {
        const batch=await fetchPage(page);
        if(!Array.isArray(batch))fail("KDS_PAID_SOURCE_SCHEMA_INVALID");
        if(!batch.length)return rows;
        const signature=JSON.stringify(batch);
        if(seen.has(signature))fail("KDS_PAID_PAGINATION_REPEATED");
        seen.add(signature);rows.push(...batch);
        if(rows.length>20000)fail("KDS_PAID_SOURCE_ROW_LIMIT");
      }
      fail("KDS_PAID_PAGINATION_INCOMPLETE");
    }
    const sales=await pages(async page=>(await c03.listSales({companyUid:scope.company_uid,brandUid:scope.brand_uid,
      storeUid:scope.store_uid,startDate:fromMs,endDate:toMs,page,resultsPerPage:200})).data);
    const known=new Set(knownTransactions);
    const fresh=sales.filter(row=>!known.has(row?.tran_id));
    let logs=[];
    if(fresh.length) {
      let start=toMs;
      for(const row of fresh) {
        if(typeof row.start_date!=="number"||!Number.isSafeInteger(row.start_date)||row.start_date<=0||row.start_date>toMs)fail("KDS_PAID_HISTORY_WINDOW_INVALID");
        start=Math.min(start,row.start_date);
      }
      logs=await pages(async page=>(await c04.getSaleChangeLog({company_uid:scope.company_uid,brand_uid:scope.brand_uid,
        store_uid:scope.store_uid,start_date:Math.max(0,start-60000),end_date:toMs,page})).rows);
    }
    const result=projectC03PaidOrdersV1({sales,logs,scope,branch,knownTransactions});
    if(signal?.aborted)fail("KDS_PAID_DEADLINE");
    return {...result,requests,c03_pages_exhausted:true,c04_pages_exhausted:fresh.length?true:null};
  };
}
module.exports={createC03PaidSourceV1};
