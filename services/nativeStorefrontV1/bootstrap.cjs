'use strict';
const RELEASE='6c22da1234254abc498d9fff99c049f8d9a87f3a3fbe65cd620f59adac82691b';
function createProductionMiddleware(env=process.env,deps={}){
 let runtime;
 return async(req,res,next)=>{
  if(!req.url?.startsWith('/stores'))return next();
  res.setHeader('X-Cing-Storefront-Release',RELEASE);
  try{runtime??=import('./runtime.mjs').then(m=>m.createRuntime(env,deps));const handler=await runtime;return await handler(req,res)}
  catch{req.resume();res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({success:false,code:'STORES_UNAVAILABLE'}));}
 };
}
module.exports={createProductionMiddleware};
