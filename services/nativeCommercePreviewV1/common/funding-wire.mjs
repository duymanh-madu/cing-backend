import {exact,fail} from './wire.mjs';
export const validSelection=s=>exact(s,['pointsRequested','paymentMethod'])&&Number.isSafeInteger(s.pointsRequested)&&s.pointsRequested>=0&&s.pointsRequested<=1e12&&['cing_wallet','external'].includes(s.paymentMethod);
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12;
export function validFunding(v){
 const keys=['contract','subtotal','shippingFee','tierDiscount','voucher','pointsAvailable','pointValueVnd','walletBalance','walletStatus','paymentMethod','pointsRequested','orderCreated','paymentEnabled','snapshotAtomic','state','prePointsPayable','maximumUsablePoints','pointsUsed','pointsDiscount','remainingPayable','walletPlanned','externalPlanned','eligible','intentHash','issuedAt','expiresAt'];
 if(!exact(v,keys)||v.contract!=='native-funding-preview-v1'||!money(v.subtotal)||!money(v.tierDiscount)||v.tierDiscount>v.subtotal||!exact(v.voucher,['mode','discount'])||v.voucher.mode!=='read_only'||v.voucher.discount!==0||!money(v.pointsAvailable)||!Number.isSafeInteger(v.pointValueVnd)||v.pointValueVnd<1||v.pointValueVnd>1e6||!money(v.walletBalance)||!['active','frozen','closed'].includes(v.walletStatus)||!validSelection({pointsRequested:v.pointsRequested,paymentMethod:v.paymentMethod})||v.orderCreated!==false||v.paymentEnabled!==false||v.snapshotAtomic!==false||typeof v.eligible!=='boolean'||!/^[a-f0-9]{64}$/.test(v.intentHash)||!Number.isFinite(Date.parse(v.issuedAt))||Date.parse(v.expiresAt)-Date.parse(v.issuedAt)!==60000)return false;
 const amounts=['prePointsPayable','maximumUsablePoints','pointsUsed','pointsDiscount','remainingPayable','walletPlanned','externalPlanned'];
 if(v.shippingFee===null)return v.state==='manual_shipping_required'&&v.eligible===false&&amounts.every(k=>v[k]===null);
 if(!money(v.shippingFee)||amounts.some(k=>!money(v[k]))||v.prePointsPayable!==v.subtotal+v.shippingFee-v.tierDiscount||v.pointsUsed!==v.pointsRequested||v.pointsUsed>v.pointsAvailable||v.maximumUsablePoints!==Math.min(v.pointsAvailable,Math.ceil(v.prePointsPayable/v.pointValueVnd))||v.pointsUsed>v.maximumUsablePoints||!Number.isSafeInteger(v.pointsUsed*v.pointValueVnd)||v.pointsDiscount!==Math.min(v.pointsUsed*v.pointValueVnd,v.prePointsPayable)||v.remainingPayable!==v.prePointsPayable-v.pointsDiscount||!['estimated','commerce_disabled','wallet_unavailable'].includes(v.state)||(v.eligible!==(v.state==='estimated')))return false;
 if(v.paymentMethod==='external')return v.walletPlanned===0&&v.externalPlanned===v.remainingPayable&&v.state!=='wallet_unavailable';
 if(v.externalPlanned!==0)return false;
 if(v.state==='wallet_unavailable')return v.walletPlanned===0&&v.remainingPayable>0;
 if(v.walletPlanned!==0&&(v.walletStatus!=='active'||v.walletBalance<v.walletPlanned))return false;
 return v.walletPlanned===v.remainingPayable||(v.state==='commerce_disabled'&&v.walletPlanned===0);
}
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export async function fundingHash(input){
 const i=input.intent;
 const clean={fulfillment:i.fulfillment,items:i.items.map(l=>({itemId:l.itemId,optionIds:[...l.optionIds].sort(),qty:l.qty,note:l.note.trim()})),destination:i.destination};
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical({intent:clean,selection:input.selection}))))).map(b=>b.toString(16).padStart(2,'0')).join('');
}
