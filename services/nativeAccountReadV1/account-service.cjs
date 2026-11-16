'use strict';
const {UUID,exact,fail}=require('./contracts.cjs');
function createAccountService({enabled=false,baseReader,crm,orders}={}){
 if(typeof enabled!=='boolean'||(enabled&&(!baseReader?.readInternal||!crm?.member||!crm?.vouchers||!crm?.historyPage||!orders?.read)))throw fail('ACCOUNT_UNAVAILABLE');
 return {async read(body){
  if(!enabled)throw fail('ACCOUNT_READ_DISABLED');if(!exact(body,['customerId','section','page'])||!UUID.test(body.customerId)||!['summary','vouchers','orders'].includes(body.section)||!Number.isInteger(body.page)||body.page<1||body.page>50||(body.section!=='orders'&&body.page!==1))throw fail('ACCOUNT_INVALID');
  try{const before=await baseReader.readInternal({customerId:body.customerId});const owner=before.identity.phone;let data;
   if(body.section==='summary'){let m;try{m=await crm.member(owner);}catch{m={state:'unavailable',code:'SOURCE_UNAVAILABLE'};}const s=before.snapshot.sections;data={profile:s.profile,points:s.points,spending:s.spending,partner:s.partner,crmMember:m};}
   else if(body.section==='vouchers')data=await crm.vouchers(owner);
   else {data={};try{data.app=await orders.read({ownerPhone:owner,offset:(body.page-1)*50});}catch(e){if(e?.code==='ORDER_OWNER_CONFLICT')throw fail('ACCOUNT_IDENTITY_CONFLICT');data.app={state:'unavailable',code:'SOURCE_UNAVAILABLE'};}try{data.ipos=await crm.historyPage(owner,body.page);}catch{data.ipos={state:'unavailable',code:'SOURCE_UNAVAILABLE'};}}
   const after=await baseReader.readInternal({customerId:body.customerId});if(after.identity.customerId!==before.identity.customerId||after.identity.phone!==owner||after.identity.zaloId!==before.identity.zaloId)throw fail('ACCOUNT_IDENTITY_CONFLICT');
   if(body.section==='summary'){const s=after.snapshot.sections;data={...data,profile:s.profile,points:s.points,spending:s.spending,partner:s.partner};}
   const result={contract:'native-account-data-v1',section:body.section,page:body.page,observedAt:after.snapshot.observedAt,data};
   if(!(await import('./account-contract.mjs')).validAccountData(result))throw fail('ACCOUNT_UNAVAILABLE');return result;
  }catch(e){throw fail(['ACCOUNT_INVALID','ACCOUNT_READ_DISABLED','ACCOUNT_BLOCKED','ACCOUNT_IDENTITY_CONFLICT','TRY_LATER'].includes(e?.code)?e.code:'ACCOUNT_UNAVAILABLE');}
 }};
}
module.exports={createAccountService};
