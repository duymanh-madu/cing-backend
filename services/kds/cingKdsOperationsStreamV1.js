"use strict";
const {createHash}=require("node:crypto");
function snapshotDigestV1(snapshot){
  // Freshness and sample times are transport health, not business changes.
  const {sampled_at,source_health,...business}=snapshot;
  return createHash("sha256").update(JSON.stringify(business,(key,value)=>key==="elapsed_minutes"?Math.floor(value):value)).digest("hex");
}
function createKdsOperationsStreamV1({snapshot,subscribe,schedule=setInterval,cancel=clearInterval,intervalMs=15000}){
  return async function stream(req,res){
    let closed=false,busy=false,dirty=false,last=null,unsubscribe=()=>{},timer=null;
    const end=()=>{if(closed)return;closed=true;unsubscribe();if(timer!==null)cancel(timer);res.end();};
    res.on("close",end);req.on("aborted",end);
    const write=(event,value)=>{
      if(closed)return;
      if(!res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`))end();
      else res.flush?.();
    };
    const update=async()=>{
      if(closed)return;dirty=true;if(busy)return;busy=true;
      try{do{
        dirty=false;
        const value=await snapshot(req);
        if(closed)return;
        if(!res.headersSent){res.status(200);res.setHeader("Content-Type","text/event-stream");
          res.setHeader("Cache-Control","no-cache, no-transform");res.setHeader("X-Accel-Buffering","no");res.flushHeaders?.();}
        const digest=snapshotDigestV1(value);
        if(digest!==last){last=digest;write("snapshot",value);}
        else write("heartbeat",{healthy:true});
      }while(dirty&&!closed);
      }catch{
        if(!closed){if(!res.headersSent)res.status(503).json({success:false,code:"KDS_OPS_STREAM_UNAVAILABLE"});
          else write("hold",{code:"KDS_OPS_STREAM_UNAVAILABLE"});end();}
      }finally{busy=false;}
    };
    unsubscribe=subscribe(update);
    // Recovery/authorization check also covers another replica or missed events.
    // This does not refresh the browser: unchanged snapshots emit only a heartbeat.
    timer=schedule(update,intervalMs);await update();
  };
}
module.exports={createKdsOperationsStreamV1,snapshotDigestV1};
