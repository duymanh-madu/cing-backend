'use strict';
const {fail,UUID}=require('../common/contract.cjs');
function createIdentityReader({db,normalizePhone}){
 function phoneOf(value){if(typeof value==='number'&&Number.isSafeInteger(value))value=String(value);if(typeof value!=='string'||!/^0[35789][0-9]{8}$|^\+?84[35789][0-9]{8}$/.test(value))throw fail('ACTIVITY_IDENTITY_CONFLICT');const result=normalizePhone(value);if(!/^0[35789][0-9]{8}$/.test(result))throw fail('ACTIVITY_IDENTITY_CONFLICT');return result;}
 async function rows(table,columns,filter){const result=await filter(db.from(table).select(columns,{count:'exact'})).limit(2).retry(false).abortSignal(AbortSignal.timeout(7000));if(result.error||!Array.isArray(result.data)||!Number.isSafeInteger(result.count)||result.count!==result.data.length||result.data.length>2||result.data.some(r=>!r||Object.keys(r).sort().join('|')!==columns.split(',').sort().join('|')))throw fail('ACTIVITY_UNAVAILABLE');return result.data;}
 return {async readInternal({customerId,requireGameMembership=true}){
  if(!UUID.test(customerId))throw fail('ACTIVITY_INVALID');
  const fields='id,zalo_id,phone',list=await rows('customers',fields,q=>q.eq('id',customerId));
  if(list.length!==1||list[0].id!==customerId||!/^\d{1,64}$/.test(list[0].zalo_id))throw fail('ACTIVITY_IDENTITY_CONFLICT');
  const c=list[0],phone=phoneOf(c.phone);if(!/^0[35789][0-9]{8}$/.test(phone))throw fail('ACTIVITY_IDENTITY_CONFLICT');
  const variants=[phone,'84'+phone.slice(1),'+84'+phone.slice(1)];
  for(const found of [await rows('customers',fields,q=>q.in('phone',variants)),await rows('customers',fields,q=>q.eq('zalo_id',c.zalo_id))]){
   if(found.length!==1||found[0].id!==customerId||found[0].zalo_id!==c.zalo_id||phoneOf(found[0].phone)!==phone)throw fail('ACTIVITY_IDENTITY_CONFLICT');
  }
  const players=await rows('players','user_id,phone,phone_number,zalo_user_id,name,display_name,member_activated,is_blocked',q=>q.eq('user_id',phone));
  if(players.length===0&&!requireGameMembership)return {identity:{customerId,phone,zaloId:c.zalo_id},snapshot:{sections:{profile:{name:'Cing iu'}}}};
  if(players.length!==1||players[0].user_id!==phone)throw fail('ACTIVITY_IDENTITY_CONFLICT');const p=players[0];
  for(const field of ['phone','phone_number'])if(p[field]!==null&&phoneOf(p[field])!==phone)throw fail('ACTIVITY_IDENTITY_CONFLICT');
  if(p.zalo_user_id!==null&&p.zalo_user_id!==c.zalo_id)throw fail('ACTIVITY_IDENTITY_CONFLICT');
  if(p.is_blocked!==false&&p.is_blocked!==null)throw fail('ACCOUNT_BLOCKED');if(requireGameMembership&&p.member_activated!==true)throw fail('GAME_MEMBERSHIP_REQUIRED');
  const name=typeof p.display_name==='string'&&p.display_name.trim()?p.display_name:p.name||'Cing iu';
  return {identity:{customerId,phone,zaloId:c.zalo_id},snapshot:{sections:{profile:{name}}}};
 }};
}
module.exports={createIdentityReader};
