'use strict';
function createProductionMiddleware(env=process.env,deps={}){
 const fundingFlag=env.CING_NATIVE_FUNDING_READ_ENABLED;if(fundingFlag!==undefined&&!['true','false'].includes(fundingFlag))throw Error('FUNDING_CONFIGURATION_INVALID');if(fundingFlag==='true'&&env.CING_NATIVE_QUOTE_READ_ENABLED!=='true')throw Error('FUNDING_REQUIRES_QUOTE');
 const flag=env.CING_NATIVE_QUOTE_READ_ENABLED;if(flag!==undefined&&!['true','false'].includes(flag))throw Error('QUOTE_CONFIGURATION_INVALID');
 const {createQuoteHandler}=require('../common/http.cjs');
 if(flag!=='true'){const h=createQuoteHandler({mode:'internal'});return async(req,res,next)=>{if(!await h(req,res))next();};}
 const key=env.CING_NATIVE_QUOTE_READ_BRIDGE_KEY;
 if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key)||[env.CING_NATIVE_ACCOUNT_READ_BRIDGE_KEY,env.CING_NATIVE_CUSTOMER_READ_BRIDGE_KEY,env.CING_NATIVE_ZALO_PROOF_BRIDGE_KEY].includes(key))throw Error('QUOTE_CONFIGURATION_INVALID');
 const db=deps.db||require('../../../supabase');
 const {createAccountReader}=require('../../nativeAccountReadV1/account-read-adapter.cjs');
 const {priceCanonicalCartFromCatalog}=require('../../commerce/canonicalMerchandisePricingService');
 const {calculateShippingFee,getShippingConfig}=require('../../shippingService');
 const google=deps.google||require('./google.cjs').createGoogleRead({placesKey:env.GOOGLE_MAPS_PLACES_API_KEY,routesKey:env.GOOGLE_MAPS_ROUTES_API_KEY},deps.transport||globalThis.fetch);
 const projection=require('../common/production.cjs').createProductionProjection({enabled:true,
 async readCatalog(){const r=await db.from('menu_items').select('id,foodbook_id,store_item_id,name,category,price,active,raw_data',{count:'exact'}).eq('active',true).order('id').range(0,9999).retry(false).abortSignal(AbortSignal.timeout(7000));if(r.error)throw Error('QUOTE_UNAVAILABLE');return {rows:r.data,total:r.count,complete:Number.isSafeInteger(r.count)&&r.count===r.data?.length};},priceCart:priceCanonicalCartFromCatalog,readShippingConfig:getShippingConfig,placeDetails:google.details,driveRoute:google.route,shippingFee:calculateShippingFee});
 const ownerReader=createAccountReader({enabled:true,db});
 let fundingSource;
 if(fundingFlag==='true'){
  const financeReader=require('../common/read-adapter.cjs').createFinanceReader({enabled:true,db,ownerReader});
  fundingSource=require('../common/production-source.cjs').createProductionSource({enabled:true,financeReader,quoteProjection:projection,validateProjection:require('../common/quote.cjs').validateProjection});
 }
 const service=require('./service.cjs').createPrivateService({enabled:true,ownerReader,projection,google,fundingSource,fundingEnabled:fundingFlag==='true'});
 const h=createQuoteHandler({mode:'internal',enabled:true,privateKey:key,service});return async(req,res,next)=>{if(!await h(req,res))next();};
}
module.exports={createProductionMiddleware};
