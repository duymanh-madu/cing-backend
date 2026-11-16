'use strict';
// Dormant preview only. No database, provider, ledger or settlement imports.
const {createHash}=require('node:crypto');
const fingerprint=v=>createHash('sha256').update(JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x)).digest('hex');
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const fail=code=>Object.assign(Error(code),{code});
const money=v=>Number.isSafeInteger(v)&&v>=0&&v<=1e12;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function validateSelection(s){
 if(!exact(s,['pointsRequested','paymentMethod'])||!money(s.pointsRequested)||!['cing_wallet','external'].includes(s.paymentMethod))throw fail('FUNDING_INVALID');
 return {...s};
}
function finance(v){
 if(!exact(v,['tier','points','pointValueVnd','wallet','policy'])||typeof v.tier!=='string'||!v.tier||v.tier.length>80||!money(v.points)||!Number.isSafeInteger(v.pointValueVnd)||v.pointValueVnd<1||v.pointValueVnd>1e6||!exact(v.wallet,['balance','status','accountCreated'])||!money(v.wallet.balance)||!['active','frozen','closed'].includes(v.wallet.status)||typeof v.wallet.accountCreated!=='boolean')throw fail('FUNDING_UNAVAILABLE');
 const p=v.policy;
 if(!exact(p,['appStatus','maintenance','ordering','payment','walletAllowed'])||typeof p.appStatus!=='string'||['maintenance','ordering','payment','walletAllowed'].some(k=>typeof p[k]!=='boolean'))throw fail('FUNDING_UNAVAILABLE');
 if(!v.wallet.accountCreated&&(v.wallet.balance!==0||v.wallet.status!=='active'))throw fail('FUNDING_UNAVAILABLE');
 return v;
}
function createCalculator({calculateOrderDiscount,pricePointRedemption}){
 return function calculate({quote,selection,snapshot}){
  const s=validateSelection(selection),f=finance(snapshot);
  if(!exact(quote,['subtotal','shippingFee'])||!money(quote.subtotal)||(quote.shippingFee!==null&&!money(quote.shippingFee)))throw fail('FUNDING_UNAVAILABLE');
  const tier=f.tier.trim().toLowerCase();
  const discount=calculateOrderDiscount(quote.subtotal,tier)?.discount_amount;
  if(!money(discount)||discount>quote.subtotal)throw fail('FUNDING_UNAVAILABLE');
  const permitted=f.policy.appStatus==='active'&&!f.policy.maintenance&&f.policy.ordering&&f.policy.payment;
  const base={contract:'native-funding-preview-v1',subtotal:quote.subtotal,shippingFee:quote.shippingFee,tierDiscount:discount,voucher:{mode:'read_only',discount:0},pointsAvailable:f.points,pointValueVnd:f.pointValueVnd,walletBalance:f.wallet.balance,walletStatus:f.wallet.status,paymentMethod:s.paymentMethod,pointsRequested:s.pointsRequested,orderCreated:false,paymentEnabled:false,snapshotAtomic:false};
  if(quote.shippingFee===null)return {...base,state:'manual_shipping_required',prePointsPayable:null,maximumUsablePoints:null,pointsUsed:null,pointsDiscount:null,remainingPayable:null,walletPlanned:null,externalPlanned:null,eligible:false};
  const pre=quote.subtotal+quote.shippingFee-discount;
  if(!money(pre))throw fail('FUNDING_UNAVAILABLE');
  let p;try{p=pricePointRedemption({requestedPoints:s.pointsRequested,availablePoints:f.points,prePointsPayable:pre,pointValueVnd:f.pointValueVnd});}catch(e){throw fail(['COMMERCE_POINTS_INSUFFICIENT_BALANCE','COMMERCE_POINTS_EXCEEDS_PAYABLE'].includes(e?.code)?'FUNDING_SELECTION_CHANGED':'FUNDING_UNAVAILABLE');}
  const remaining=p.remaining_payable;
  if(!money(remaining)||!money(p.points_discount)||remaining+p.points_discount!==pre||p.points_used!==s.pointsRequested||!money(p.maximum_usable_points))throw fail('FUNDING_UNAVAILABLE');
  // Like the existing checkout: points plus Wallet can cover one order.
  // No automatic split of an insufficient Wallet balance onto an external rail.
  const walletSelected=s.paymentMethod==='cing_wallet'&&remaining>0;
  const usable=!walletSelected||(f.policy.walletAllowed&&f.wallet.status==='active'&&f.wallet.balance>=remaining);
  return {...base,state:!permitted?'commerce_disabled':!usable?'wallet_unavailable':'estimated',prePointsPayable:pre,maximumUsablePoints:p.maximum_usable_points,pointsUsed:p.points_used,pointsDiscount:p.points_discount,remainingPayable:remaining,walletPlanned:walletSelected&&usable?remaining:0,externalPlanned:s.paymentMethod==='external'?remaining:0,eligible:permitted&&usable};
 };
}
function context(v){if(!exact(v,['sessionId','linkId','customerId'])||Object.values(v).some(x=>!UUID.test(x)))throw fail('FUNDING_UNAVAILABLE');return {...v};}
function createService({enabled=false,authorize,readSource,calculate,validateIntent,now=Date.now}){
 let pending=0;
 return {async preview(b){
  if(enabled!==true)throw fail('FUNDING_DISABLED');
  if(!exact(b,['accessToken','intent','selection'])||typeof b.accessToken!=='string'||!/^cn_a1\.[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(b.accessToken))throw fail('FUNDING_INVALID');
  const selection=validateSelection(b.selection),token=b.accessToken;
  let intent;try{intent=validateIntent(b.intent);}catch{throw fail('FUNDING_INVALID');}
  // Copy caller-owned objects before the first await; mutations cannot swap intent.
  intent=JSON.parse(JSON.stringify(intent));
  if(pending>=2)throw fail('TRY_LATER');pending++;
  const started=now();
  try{
   const before=context(await authorize(token));
   const source=await readSource({customerId:before.customerId,intent});
   if(!exact(source,['quote','snapshot']))throw fail('FUNDING_UNAVAILABLE');
   const result=calculate({quote:source.quote,snapshot:source.snapshot,selection});
   const after=context(await authorize(token));
   if(Object.keys(before).some(k=>before[k]!==after[k]))throw fail('SESSION_INVALID');
   const at=now();if(at<started||at-started>30000)throw fail('FUNDING_UNAVAILABLE');
   const hash=fingerprint({intent,selection});if(!/^[a-f0-9]{64}$/.test(hash))throw fail('FUNDING_UNAVAILABLE');
   return {...result,intentHash:hash,issuedAt:new Date(at).toISOString(),expiresAt:new Date(at+60000).toISOString()};
  }catch(e){throw fail(['SESSION_INVALID','ACCOUNT_NOT_LINKED','ACCOUNT_BLOCKED','ACCOUNT_IDENTITY_CONFLICT','FUNDING_SELECTION_CHANGED','TRY_LATER'].includes(e?.code)?e.code:'FUNDING_UNAVAILABLE');}
  finally{pending--;}
 }};
}
module.exports={createCalculator,createService,validateSelection,finance,exact,fail};
