'use strict';
const {validateIntent,validateProjection,exact,money}=require('./quote.cjs');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const fail=code=>Object.assign(new Error(code),{code});
const validText=(s,max)=>typeof s==='string'&&s.trim()&&s.length<=max&&!/[\x00-\x1f\x7f]/.test(s);
// Functions are injected by a future reviewed mount; this file imports no database/provider.
// Existing merchandise and shipping authorities are reused; no fallback pricing copy.
function createProductionProjection({enabled=false,readCatalog,priceCart,readShippingConfig,placeDetails,driveRoute,shippingFee}={}){
 return async function project(request){
  if(enabled!==true)throw fail('QUOTE_DISABLED');
  if(!exact(request,['customerId','intent'])||!(/^[0-9a-f-]{36}$/).test(request.customerId))throw fail('QUOTE_INVALID');
  const intent=validateIntent(request.intent);
  try{
   const snapshot=await readCatalog();
   if(!exact(snapshot,['rows','total','complete'])||snapshot.complete!==true||!Array.isArray(snapshot.rows)||snapshot.rows.length!==snapshot.total||snapshot.total<1)throw fail('QUOTE_UNAVAILABLE');
   // Exact count protects against a default PostgREST row limit; active=true is mandatory.
   if(snapshot.rows.some(r=>r?.active!==true||typeof r.price!=='number'||!money(r.price)))throw fail('QUOTE_UNAVAILABLE');
   const result=priceCart({items:intent.items.map(i=>({store_item_id:i.itemId,customization_option_ids:i.optionIds,quantity:i.qty,note:i.note})),menuItems:snapshot.rows});
   const lines=result.items.map(l=>({itemId:l.store_item_id,name:l.name,qty:l.quantity,basePrice:l.base_price,options:l.customizations.map(o=>({id:o.store_item_id,name:o.name,price:o.price})),unitPrice:l.unit_price,lineTotal:l.line_total,note:l.note}));
   let shipping={state:'not_required',fee:0,distanceMeters:null,durationSeconds:null},address=null;
   if(intent.fulfillment==='delivery'){
    const d=await placeDetails({place_id:intent.destination.placeId,session_token:intent.destination.searchSessionId});
    if(d?.requested_place_id!==intent.destination.placeId||!validText(d.place_id,300)||!validText(d.formatted_address,1000))throw fail('QUOTE_UNAVAILABLE');
    const c=await readShippingConfig();
    if(!c||typeof c.store_latitude!=='number'||typeof c.store_longitude!=='number'||!Number.isFinite(c.store_latitude)||Math.abs(c.store_latitude)>90||!Number.isFinite(c.store_longitude)||Math.abs(c.store_longitude)>180)throw fail('QUOTE_UNAVAILABLE');
    const r=await driveRoute({origin_latitude:c.store_latitude,origin_longitude:c.store_longitude,destination_place_id:d.place_id});
    if(r?.place_id!==d.place_id||r.provider!=='google_routes_v2'||r.travel_mode!=='DRIVE'||!Number.isSafeInteger(r.distance_meters)||r.distance_meters<0||!Number.isSafeInteger(r.duration_seconds)||r.duration_seconds<0||typeof r.latitude!=='number'||!Number.isFinite(r.latitude)||Math.abs(r.latitude)>90||typeof r.longitude!=='number'||!Number.isFinite(r.longitude)||Math.abs(r.longitude)>180)throw fail('QUOTE_UNAVAILABLE');
    const configSnapshot=canonical(c);
    const s=await shippingFee({total_amount:result.subtotal,destination_latitude:r.latitude,destination_longitude:r.longitude,route_snapshot:{distance_meters:r.distance_meters,duration_seconds:r.duration_seconds,provider:r.provider}});
    if(canonical(await readShippingConfig())!==configSnapshot)throw fail('QUOTE_UNAVAILABLE');
    if(s?.success!==true||s.route_distance_meters!==r.distance_meters||s.route_duration_seconds!==r.duration_seconds||!money(s.shipping_fee))throw fail('QUOTE_UNAVAILABLE');
    if(s.manual_shipping_quote_required===true){if(s.free_shipping!==false||s.shipping_fee!==0)throw fail('QUOTE_UNAVAILABLE');shipping={state:'manual_required',fee:null,distanceMeters:r.distance_meters,durationSeconds:r.duration_seconds};}
    else{if(s.free_shipping!==(s.shipping_fee===0))throw fail('QUOTE_UNAVAILABLE');shipping={state:'priced',fee:s.shipping_fee,distanceMeters:r.distance_meters,durationSeconds:r.duration_seconds};}
    address={label:d.formatted_address};
   }
   return validateProjection({lines,subtotal:result.subtotal,shipping,address},intent);
  }catch(e){const code=e?.code||'';throw fail(code==='COMMERCE_PRICING_ITEM_NOT_FOUND'||code==='COMMERCE_PRICING_ITEM_INACTIVE'?'QUOTE_ITEM_UNAVAILABLE':/^COMMERCE_PRICING_(OPTION|GROUP)/.test(code)?'QUOTE_SELECTION_CHANGED':'QUOTE_UNAVAILABLE');}
 };
}
module.exports={createProductionProjection};
