'use strict';
const {createAccountHandler}=require('./account-http.cjs');
function createProductionMiddleware(env=process.env,deps={}){
 const value=env.CING_NATIVE_ACCOUNT_READ_ENABLED;if(value!==undefined&&!['true','false'].includes(value))throw Error('ACCOUNT_CONFIGURATION_INVALID');
 if(value!=='true'){const h=createAccountHandler({mode:'internal'});return async(req,res,next)=>{if(!await h(req,res))next();};}
 const key=env.CING_NATIVE_ACCOUNT_READ_BRIDGE_KEY;
 if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key)||[env.CING_NATIVE_CUSTOMER_READ_BRIDGE_KEY,env.CING_NATIVE_ZALO_PROOF_BRIDGE_KEY].includes(key))throw Error('ACCOUNT_CONFIGURATION_INVALID');
 if(env.IPOS_BASE_URL&&env.IPOS_BASE_URL.replace(/\/$/,'')!=='https://api.foodbook.vn')throw Error('ACCOUNT_CONFIGURATION_INVALID');
 const db=deps.db||require('../../supabase');
 const {createAccountReader}=require('./account-read-adapter.cjs'),{createCrmReader}=require('./crm-read.cjs'),{createOrderReader}=require('./order-read.cjs'),{createAccountService}=require('./account-service.cjs');
 const service=createAccountService({enabled:true,baseReader:createAccountReader({enabled:true,db,now:deps.now||Date.now}),orders:createOrderReader({enabled:true,db}),crm:createCrmReader({key:env.IPOS_ACCESS_TOKEN,parent:env.IPOS_POS_PARENT},deps.transport||globalThis.fetch)});
 const h=createAccountHandler({mode:'internal',enabled:true,privateKey:key,service:{async read(body){const {UUID,exact}=require('./contracts.cjs');if(!exact(body,['requestId','customerId','section','page'])||!UUID.test(body.requestId))throw Object.assign(Error('ACCOUNT_INVALID'),{code:'ACCOUNT_INVALID'});const payload=await service.read({customerId:body.customerId,section:body.section,page:body.page});return {requestId:body.requestId,customerId:body.customerId,payload};}}});
 return async(req,res,next)=>{if(!await h(req,res))next();};
}
module.exports={createProductionMiddleware};
