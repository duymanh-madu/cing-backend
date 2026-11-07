'use strict';
const DAY=86400000, OFFSET=7*3600000;
function splitVietnamDaysV1(from,to){
 if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<from||to>8640000000000000-OFFSET)throw Object.assign(new Error('KDS_PAID_WINDOW_INVALID'),{code:'KDS_PAID_WINDOW_INVALID'});
 const windows=[];
 for(let start=from;start<=to;){
  if(windows.length>=32)throw Object.assign(new Error('KDS_PAID_DAY_WINDOW_LIMIT'),{code:'KDS_PAID_DAY_WINDOW_LIMIT'});
  const end=Math.min(to,(Math.floor((start+OFFSET)/DAY)+1)*DAY-OFFSET-1);
  windows.push({fromMs:start,toMs:end});start=end+1;
 }
 return windows;
}
async function collectVietnamDayPagesV1(from,to,pages,fetchPage){
 const windows=splitVietnamDaysV1(from,to),rows=[];
 for(const w of windows){
  const batch=await pages(page=>fetchPage(w.fromMs,w.toMs,page));
  rows.push(...batch);
  if(rows.length>20000)throw Object.assign(new Error('KDS_PAID_SOURCE_ROW_LIMIT'),{code:'KDS_PAID_SOURCE_ROW_LIMIT'});
 }
 return rows;
}
module.exports={splitVietnamDaysV1,collectVietnamDayPagesV1};
