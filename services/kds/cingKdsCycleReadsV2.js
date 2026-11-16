"use strict";
const DAY=86400000,OFFSET=7*3600000;
function error(code){return Object.assign(new Error(code),{code});}
function createKdsCycleReadsV2({requestFn,signal,deadlineAt,concurrency=3,maxRequests=192,maxCacheBytes=16777216}={}){
 if(typeof requestFn!=="function"||!Number.isSafeInteger(deadlineAt)||!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>3||!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>192||!Number.isSafeInteger(maxCacheBytes)||maxCacheBytes<1||maxCacheBytes>16777216)throw error('KDS_PAID_READ_CONFIG_INVALID');
 const controller=new AbortController(),cache=new Map(),waiting=[];
 const metrics={requests:0,cache_hits:0,peak_in_flight:0,cached_bytes:0,day_windows:0};
 let active=0,fatal=null,closed=false;
 function wake(){for(const next of waiting.splice(0))next();}
 function abort(code){fatal=fatal||error(code);controller.abort();wake();}
 function check(){if(fatal)throw fatal;if(closed)throw error('KDS_PAID_READ_CLOSED');if(signal?.aborted||Date.now()>=deadlineAt){abort('KDS_PAID_DEADLINE');throw fatal;}if(controller.signal.aborted)throw error('KDS_PAID_SOURCE_READ_ABORTED');}
 const onAbort=()=>abort('KDS_PAID_DEADLINE');signal?.addEventListener('abort',onAbort,{once:true});
 const timer=setTimeout(onAbort,Math.max(0,deadlineAt-Date.now()));timer.unref?.();
 async function network(input,url,cacheable){
  check();while(active>=concurrency){await new Promise(resolve=>waiting.push(resolve));check();}
  check();active++;metrics.peak_in_flight=Math.max(metrics.peak_in_flight,active);
  try{
   if(metrics.requests>=maxRequests){abort('KDS_PAID_REQUEST_BUDGET');throw fatal;}
   metrics.requests++;
   const response=await requestFn({...input,url:url.toString(),signal:AbortSignal.any([controller.signal,input.signal].filter(Boolean))});check();
   if(cacheable&&Number(response?.status)>=200&&Number(response?.status)<300){
    let bytes;try{bytes=Buffer.byteLength(JSON.stringify(response.body??response.json??{}),'utf8');}catch{abort('KDS_PAID_CACHE_SCHEMA_INVALID');throw fatal;}
    if(metrics.cached_bytes+bytes>maxCacheBytes){abort('KDS_PAID_CACHE_BUDGET');throw fatal;}metrics.cached_bytes+=bytes;
   }
   return response;
  }finally{active--;wake();}
 }
 function request(input){
  check();const url=new URL(input.url);
  if(input.method!=='GET'||url.origin!=='https://posapi.ipos.vn'||!['/api/v3/pos-cms/sale-change-log','/api/reports_v1/v3/pos-cms/report/sale-by-date'].includes(url.pathname)){abort('KDS_PAID_REQUEST_TARGET_FORBIDDEN');throw fatal;}
  if(url.pathname.includes('sale-by-date'))url.searchParams.set('csv','1');
  if(!url.pathname.includes('sale-change-log'))return network(input,url,false);
  url.searchParams.sort();const key=url.toString();
  if(cache.has(key)){metrics.cache_hits++;return cache.get(key);}
  const promise=network(input,url,true).then(response=>{if(Number(response?.status)<200||Number(response?.status)>=300)cache.delete(key);return response;},failure=>{cache.delete(key);throw failure;});
  cache.set(key,promise);return promise;
 }
 async function collectDays(from,to,pages,fetchPage){
  check();if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<from||to>8640000000000000-OFFSET)throw error('KDS_PAID_WINDOW_INVALID');
  let next=from,index=0,totalRows=0,firstFailure=null;const parts=[];
  async function worker(){
   while(next<=to){
    check();const start=next,end=Math.min(to,(Math.floor((start+OFFSET)/DAY)+1)*DAY-OFFSET-1),slot=index++;next=end+1;metrics.day_windows++;
    const batch=await pages(page=>fetchPage(start,end,page));check();
    if(!Array.isArray(batch))throw error('KDS_PAID_SOURCE_SCHEMA_INVALID');totalRows+=batch.length;
    if(totalRows>20000){abort('KDS_PAID_SOURCE_ROW_LIMIT');throw fatal;}parts[slot]=batch;
   }
  }
  await Promise.allSettled(Array.from({length:concurrency},()=>worker().catch(e=>{if(!firstFailure){firstFailure=e;controller.abort();wake();}throw e;})));
  if(firstFailure)throw firstFailure;
  check();return parts.flat();
 }
 function close(){closed=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);controller.abort();wake();cache.clear();}
 return {request,collectDays,check,close,metrics:()=>({...metrics})};
}
module.exports={createKdsCycleReadsV2};
