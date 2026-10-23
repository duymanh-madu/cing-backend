"use strict";
const {createHash}=require("node:crypto");
function snapshotDigestV1(snapshot){const {sampled_at,source_health,...business}=snapshot;
 return createHash("sha256").update(JSON.stringify(business,(key,value)=>key==="elapsed_minutes"?Math.floor(value):value)).digest("hex");}
function createKdsOperationsStreamV1({snapshot,subscribe,schedule=setInterval,cancel=clearInterval,intervalMs=10000,drainTimeoutMs=30000}){
 return async function stream(req,res){
  let closed=false,busy=false,dirty=false,last=null,unsubscribe=()=>{},timer=null;
  const end=()=>{if(closed)return;closed=true;unsubscribe();if(timer!==null)cancel(timer);res.end();};
  res.on("close",end);res.on("error",end);req.on("aborted",end);
  async function write(event,value){
   if(closed)return;
   const chunk=`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
   if(Buffer.byteLength(chunk)>8*1024*1024)throw Error("KDS_OPS_SNAPSHOT_LIMIT");
   // false means queued successfully, wait for drain; it is NOT a disconnected client.
   if(!res.write(chunk))await new Promise((resolve,reject)=>{
    let timeout;
    const cleanup=()=>{clearTimeout(timeout);res.off("drain",drain);res.off("close",close);res.off("error",fail);};
    const drain=()=>{cleanup();resolve();};
    const close=()=>{cleanup();resolve();};
    const fail=()=>{cleanup();reject(Error("KDS_OPS_STREAM_WRITE_FAILED"));};
    res.once("drain",drain);res.once("close",close);res.once("error",fail);
    timeout=setTimeout(fail,drainTimeoutMs);timeout.unref?.();
   });
   res.flush?.();
  }
  const update=async()=>{
   if(closed)return;dirty=true;if(busy)return;busy=true;
   try{do{
    dirty=false;const value=await snapshot(req);if(closed)return;
    if(!res.headersSent){res.status(200);res.setHeader("Content-Type","text/event-stream");
     res.setHeader("Cache-Control","no-cache, no-transform");res.setHeader("X-Accel-Buffering","no");res.flushHeaders?.();}
    const digest=snapshotDigestV1(value);
    if(digest!==last){await write("snapshot",value);last=digest;}else await write("heartbeat",{healthy:true});
   }while(dirty&&!closed);
   }catch(error){if(!closed){
    const code=/^KDS_OPS_(UNAUTHORIZED|FORBIDDEN|SOURCE_STALE|READ_DISABLED|POLICY_REQUIRED|SNAPSHOT_LIMIT)$/.test(error?.code||"")?error.code:"KDS_OPS_STREAM_UNAVAILABLE";
    if(!res.headersSent)res.status(code==="KDS_OPS_UNAUTHORIZED"?401:code==="KDS_OPS_FORBIDDEN"?403:503).json({success:false,code});
    else try{await write("hold",{code});}catch{}
    end();
   }}finally{busy=false;}
  };
  unsubscribe=subscribe(update);timer=schedule(update,intervalMs);await update();
 };
}
module.exports={createKdsOperationsStreamV1,snapshotDigestV1};
