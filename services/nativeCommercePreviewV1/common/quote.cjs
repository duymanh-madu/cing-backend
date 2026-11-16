'use strict';
// Dormant read-only quote contract. No payment/order/address persistence authority.
const {createHash}=require('node:crypto');
const fail=code=>Object.assign(new Error(code),{code});
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID=/^ITEM-[A-Za-z0-9_-]{1,100}$/;
const text=(s,n)=>typeof s==='string'&&s.trim().length>0&&[...s].length<=n&&!/[\x00-\x1f\x7f]/.test(s);
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000000;
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function validateIntent(v){
 if(!exact(v,['fulfillment','items','destination'])||!['pickup','dine_in','delivery'].includes(v.fulfillment)||!Array.isArray(v.items)||v.items.length<1||v.items.length>40)throw fail('QUOTE_INVALID');
 let total=0;const items=v.items.map(i=>{
  if(!exact(i,['itemId','optionIds','qty','note'])||!ID.test(i.itemId)||!Number.isSafeInteger(i.qty)||i.qty<1||i.qty>99||!Array.isArray(i.optionIds)||i.optionIds.length>100||i.optionIds.some(id=>typeof id!=='string'||!ID.test(id))||new Set(i.optionIds).size!==i.optionIds.length||typeof i.note!=='string'||[...i.note].length>200||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(i.note))throw fail('QUOTE_INVALID');
  total+=i.qty;return {itemId:i.itemId,optionIds:[...i.optionIds].sort(),qty:i.qty,note:i.note.trim()};
 });if(total>200)throw fail('QUOTE_INVALID');
 if(v.fulfillment==='delivery'){
  if(!exact(v.destination,['placeId','searchSessionId'])||!text(v.destination.placeId,300)||v.destination.placeId.length<5||!UUID.test(v.destination.searchSessionId))throw fail('QUOTE_INVALID');
 }else if(v.destination!==null)throw fail('QUOTE_INVALID');
 return freeze({fulfillment:v.fulfillment,items,destination:v.destination?{...v.destination}:null});
}
function fingerprint(v){return createHash('sha256').update(JSON.stringify(validateIntent(v))).digest('hex');}
function context(v){if(!exact(v,['sessionId','linkId','customerId'])||Object.values(v).some(x=>typeof x!=='string'||!UUID.test(x)))throw fail('QUOTE_UNAVAILABLE');return v;}
function validateProjection(p,intent){
 if(!exact(p,['lines','subtotal','shipping','address'])||!Array.isArray(p.lines)||p.lines.length!==intent.items.length||!money(p.subtotal))throw fail('QUOTE_UNAVAILABLE');
 let subtotal=0;for(let n=0;n<p.lines.length;n++){
  const l=p.lines[n],i=intent.items[n];
  if(!exact(l,['itemId','name','qty','basePrice','options','unitPrice','lineTotal','note'])||l.itemId!==i.itemId||l.qty!==i.qty||l.note!==i.note||!text(l.name,250)||!Array.isArray(l.options)||l.options.length!==i.optionIds.length||!money(l.basePrice)||!money(l.unitPrice)||!money(l.lineTotal))throw fail('QUOTE_UNAVAILABLE');
  let optionTotal=0;const ids=[];for(const o of l.options){if(!exact(o,['id','name','price'])||!ID.test(o.id)||!text(o.name,250)||!money(o.price))throw fail('QUOTE_UNAVAILABLE');ids.push(o.id);optionTotal+=o.price;}
  if(JSON.stringify(ids.sort())!==JSON.stringify(i.optionIds)||l.unitPrice!==l.basePrice+optionTotal||l.lineTotal!==l.unitPrice*i.qty)throw fail('QUOTE_UNAVAILABLE');subtotal+=l.lineTotal;
 }if(!money(subtotal)||subtotal!==p.subtotal)throw fail('QUOTE_UNAVAILABLE');
 const s=p.shipping;
 if(!exact(s,['state','fee','distanceMeters','durationSeconds'])||!['not_required','priced','manual_required'].includes(s.state))throw fail('QUOTE_UNAVAILABLE');
 if(intent.fulfillment!=='delivery'){
  if(s.state!=='not_required'||s.fee!==0||s.distanceMeters!==null||s.durationSeconds!==null||p.address!==null)throw fail('QUOTE_UNAVAILABLE');
 }else{
  if(s.state==='not_required'||!Number.isSafeInteger(s.distanceMeters)||s.distanceMeters<0||!Number.isSafeInteger(s.durationSeconds)||s.durationSeconds<0||!exact(p.address,['label'])||!text(p.address.label,1000))throw fail('QUOTE_UNAVAILABLE');
  if(s.state==='manual_required'?s.fee!==null:!money(s.fee))throw fail('QUOTE_UNAVAILABLE');
 }
 return p;
}
function createQuoteService({enabled=false,authorize,source,now=Date.now,maxConcurrent=2}={}){
 if(typeof enabled!=='boolean'||!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>4)throw fail('QUOTE_UNAVAILABLE');let pending=0;
 return {async quote(body){
  if(!enabled)throw fail('QUOTE_DISABLED');
  if(!exact(body,['accessToken','intent'])||typeof body.accessToken!=='string'||!/^cn_a1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(body.accessToken))throw fail('QUOTE_INVALID');
  const intent=validateIntent(body.intent),started=now();if(pending>=maxConcurrent)throw fail('TRY_LATER');pending++;
  try{
   const before=context(await authorize(body.accessToken));
   const p=validateProjection(await source({customerId:before.customerId,intent}),intent);
   const after=context(await authorize(body.accessToken));
   if(['sessionId','linkId','customerId'].some(k=>after[k]!==before[k]))throw fail('SESSION_INVALID');
   const issuedAt=now();if(issuedAt<started||issuedAt-started>30000)throw fail('QUOTE_UNAVAILABLE');
   return freeze({contract:'native-commerce-preview-v1',intentHash:fingerprint(intent),fulfillment:intent.fulfillment,issuedAt:new Date(issuedAt).toISOString(),expiresAt:new Date(issuedAt+60000).toISOString(),...p,
    totalBeforeDiscounts:p.shipping.fee===null?null:p.subtotal+p.shipping.fee,
    discountsIncluded:false,paymentEnabled:false,orderCreated:false});
  }catch(e){throw fail(['SESSION_INVALID','ACCOUNT_NOT_LINKED','ACCOUNT_BLOCKED','ACCOUNT_IDENTITY_CONFLICT','QUOTE_READ_DISABLED','QUOTE_ITEM_UNAVAILABLE','QUOTE_SELECTION_CHANGED','TRY_LATER'].includes(e?.code)?e.code:'QUOTE_UNAVAILABLE');}finally{pending--;}
 }};
}
module.exports={createQuoteService,validateIntent,validateProjection,fingerprint,exact,money};
