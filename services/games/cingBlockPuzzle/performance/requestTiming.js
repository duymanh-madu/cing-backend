const {AsyncLocalStorage}=require('node:async_hooks');
const context=new AsyncLocalStorage();
async function measureStage(name,task) {
 const state=context.getStore();if(!state)return task();
 const started=performance.now();try{return await task();}
 finally {state.stages.set(name,(state.stages.get(name)||0)+performance.now()-started);}
}
function blockPuzzleTiming(req,res,next) {
 const state={started:performance.now(),stages:new Map()};const send=res.json;
 res.json=function(body) {
  const stages=[['app',performance.now()-state.started],...state.stages];
  this.setHeader('Server-Timing',stages.map(([name,duration])=>`${name};dur=${duration.toFixed(1)}`).join(', '));
  return send.call(this,body);
 };
 context.run(state,next);
}
module.exports={measureStage,blockPuzzleTiming};
