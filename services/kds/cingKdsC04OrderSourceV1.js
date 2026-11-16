"use strict";
const {createKdsCycleReadsV2}=require("./cingKdsCycleReadsV2");
const {createFabiC03HttpClientV1}=require("./cingKdsFabiC03HttpClientV1");
const {createFabiC04HttpClientV1}=require("./cingKdsFabiC04HttpClientV1");
const {projectC04OrdersV1}=require("./cingKdsC04OrderProjectionV1");
function fail(code){throw Object.assign(new Error(code),{code});}
function createC04OrderSourceV1({requestFn,authProvider,appAccessTokenProvider,maxPages=20}={}){
 if(typeof requestFn!=="function"||!Number.isSafeInteger(maxPages)||maxPages<2||maxPages>100)fail("KDS_PAID_SOURCE_CONFIG_INVALID");
 return async function collect({scope,branch,fromMs,toMs,knownTransactions=[],openTransactions,deadlineAt=Date.now()+40000,signal}={}){
  if(!Number.isSafeInteger(fromMs)||!Number.isSafeInteger(toMs)||fromMs<0||toMs<fromMs)fail("KDS_PAID_WINDOW_INVALID");
  if(!Array.isArray(openTransactions)||openTransactions.length>20000)fail("KDS_PAID_OPEN_TRANSACTIONS_REQUIRED");
  const cycle=createKdsCycleReadsV2({requestFn,signal,deadlineAt});
  const request=cycle.request;
  const collectVietnamDayPagesV1=cycle.collectDays;
  try {
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
  let logs=await collectVietnamDayPagesV1(fromMs,toMs,pages,async (start_date,end_date,page)=>(await c04.getSaleChangeLog({...scope,start_date,end_date,page})).rows);
  let sales=[],c03Complete=true,c03Error=null;
  try{sales=await pages(async page=>(await c03.listSales({companyUid:scope.company_uid,brandUid:scope.brand_uid,storeUid:scope.store_uid,startDate:fromMs,endDate:toMs,page,resultsPerPage:200})).data);}
  catch(error){
   // Secondary paid-report unavailability (including 401/403) cannot suppress
   // independently authorized, complete C04 work. This grants no paid proof.
   // Invalid schemas/parity/pagination still fail rather than confirming payment.
   if(!["C03_TRANSPORT_ERROR","C03_REQUEST_TIMEOUT","C03_UPSTREAM_ERROR","C03_RATE_LIMITED","C03_AUTH_REQUIRED"].includes(error?.code))throw error;
   c03Complete=false;c03Error=error.code;
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
  if(historyFrom<fromMs)logs=(await collectVietnamDayPagesV1(Math.max(0,historyFrom-60000),toMs,pages,async (start_date,end_date,page)=>(await c04.getSaleChangeLog({...scope,start_date,end_date,page})).rows))
   .filter(row=>targets.has(row.tran_id||row.change_data?.tran_id));
  cycle.check();
  const result=projectC04OrdersV1({sales,logs,scope,branch,knownTransactions,openTransactions,deadlineAt});
  cycle.check();
  const metrics=cycle.metrics();
  return {...result,requests:metrics.requests,source_metrics:metrics,c04_pages_exhausted:true,c03_pages_exhausted:c03Complete,...(c03Error?{c03_error_code:c03Error}: {})};
  } finally {cycle.close();}
 };
}
module.exports={createC04OrderSourceV1};
