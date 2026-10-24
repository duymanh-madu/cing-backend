"use strict";
const {createFabiC03HttpClientV1}=require("./cingKdsFabiC03HttpClientV1");
const {createFabiC04HttpClientV1}=require("./cingKdsFabiC04HttpClientV1");
const {projectC04OrdersV1}=require("./cingKdsC04OrderProjectionV1");
function fail(code){throw Object.assign(new Error(code),{code});}
function createC04OrderSourceV1({requestFn,authProvider,appAccessTokenProvider,maxPages=20}={}){
 if(typeof requestFn!=="function"||!Number.isSafeInteger(maxPages)||maxPages<2||maxPages>100)fail("KDS_PAID_SOURCE_CONFIG_INVALID");
 return async function collect({scope,branch,fromMs,toMs,knownTransactions=[],openTransactions,deadlineAt=Date.now()+40000,signal}={}){
  if(!Number.isSafeInteger(fromMs)||!Number.isSafeInteger(toMs)||fromMs<0||toMs<fromMs)fail("KDS_PAID_WINDOW_INVALID");
  if(!Array.isArray(openTransactions)||openTransactions.length>20000)fail("KDS_PAID_OPEN_TRANSACTIONS_REQUIRED");
  let requests=0;
  const request=async input=>{
   if(signal?.aborted)fail("KDS_PAID_DEADLINE");const url=new URL(input.url);
   if(url.pathname==="/api/reports_v1/v3/pos-cms/report/sale-by-date")url.searchParams.set("csv","1");
   requests++;return requestFn({...input,url:url.toString(),signal:signal?AbortSignal.any([signal,input.signal].filter(Boolean)):input.signal});
  };
  const c04=createFabiC04HttpClientV1({requestFn:request,authProvider,appAccessTokenProvider,requestTimeoutMs:10000});
  const c03=createFabiC03HttpClientV1({requestFn:request,authProvider,appAccessTokenProvider,requestTimeoutMs:10000});
  async function pages(fetchPage){
   const rows=[],seen=new Set();for(let page=1;page<=maxPages;page++){
    const batch=await fetchPage(page);if(!Array.isArray(batch))fail("KDS_PAID_SOURCE_SCHEMA_INVALID");
    if(!batch.length)return rows;const signature=JSON.stringify(batch);
    if(seen.has(signature))fail("KDS_PAID_PAGINATION_REPEATED");seen.add(signature);rows.push(...batch);
    if(rows.length>20000)fail("KDS_PAID_SOURCE_ROW_LIMIT");
   }fail("KDS_PAID_PAGINATION_INCOMPLETE");
  }
  let logs=await pages(async page=>(await c04.getSaleChangeLog({...scope,start_date:fromMs,end_date:toMs,page})).rows);
  let sales=[],c03Complete=true;
  try{sales=await pages(async page=>(await c03.listSales({companyUid:scope.company_uid,brandUid:scope.brand_uid,storeUid:scope.store_uid,startDate:fromMs,endDate:toMs,page,resultsPerPage:200})).data);}
  catch(error){
   // A transport failure in the secondary paid report cannot suppress C04 work.
   // Invalid schemas/parity/pagination still fail rather than confirming payment.
   if(!["C03_TRANSPORT_ERROR","C03_REQUEST_TIMEOUT","C03_UPSTREAM_ERROR","C03_RATE_LIMITED"].includes(error?.code))throw error;
   c03Complete=false;
  }
  // Widen for overnight histories, but only retain transactions observed in
  // the requested window or in its C03 report. Unrelated old bills stay out.
  const known=new Set(knownTransactions);
  const targets=new Set(logs.map(row=>row.tran_id||row.change_data?.tran_id));
  let historyFrom=fromMs;
  for(const row of logs){const start=row.change_data?.tran_date;
   if(Number.isSafeInteger(start)&&start>=946684800000&&start<historyFrom)historyFrom=start;
  }
  for(const row of sales)if(!known.has(row.tran_id)){
   targets.add(row.tran_id);
   if(!Number.isSafeInteger(row.start_date)||row.start_date<946684800000||row.start_date>toMs)fail("KDS_PAID_HISTORY_WINDOW_INVALID");
   historyFrom=Math.min(historyFrom,row.start_date);
  }
  if(historyFrom<fromMs)logs=(await pages(async page=>(await c04.getSaleChangeLog({...scope,start_date:Math.max(0,historyFrom-60000),end_date:toMs,page})).rows))
   .filter(row=>targets.has(row.tran_id||row.change_data?.tran_id));
  if(signal?.aborted)fail("KDS_PAID_DEADLINE");
  const result=projectC04OrdersV1({sales,logs,scope,branch,knownTransactions,openTransactions,deadlineAt});
  return {...result,requests,c04_pages_exhausted:true,c03_pages_exhausted:c03Complete};
 };
}
module.exports={createC04OrderSourceV1};
