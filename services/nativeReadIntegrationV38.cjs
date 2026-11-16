'use strict';
// Optional native boundaries cannot prevent KDS or the existing app from starting.
// Existing activity canary checks stay intact; no checkout/startup worker is registered.
function boundary(prefix,create,code){
  let handler,unavailable=false;
  function fail(req,res){
    req.resume();
    if(res.headersSent){if(!res.writableEnded)res.end();return;}
    res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
    res.end(JSON.stringify({success:false,code}));
  }
  return async(req,res,next)=>{
    if(!req.url?.startsWith(prefix))return next();
    if(unavailable)return fail(req,res);
    if(!handler){try{handler=create();}catch{unavailable=true;return fail(req,res);}}
    try{return await handler(req,res,next);}catch{return fail(req,res);}
  };
}
function mountNativeReads(app,env=process.env){
  app.use(boundary('/stores',()=>require('./nativeStorefrontV1/bootstrap.cjs').createProductionMiddleware(env),'STORES_UNAVAILABLE'));
  app.use(boundary('/internal/native-commerce-preview-v1',()=>require('./nativeCommercePreviewV1/production/bootstrap.cjs').createProductionMiddleware(env),'QUOTE_UNAVAILABLE'));
  app.use(boundary('/internal/native-activity-v1',()=>require('./nativeActivityV1/production/bootstrap.cjs').createMiddleware(env),'ACTIVITY_UNAVAILABLE'));
  app.use(boundary('/internal/native-account-read-v1',()=>require('./nativeAccountReadV1/bootstrap.cjs').createProductionMiddleware(env),'ACCOUNT_UNAVAILABLE'));
  app.use(boundary('/internal/native-customer-read-v1',()=>require('./nativeCustomerReadV1/http-bridge.cjs').createProductionMiddleware(env),'CUSTOMER_READ_UNAVAILABLE'));
}
module.exports={mountNativeReads};
