'use strict';
// Dormant Production-side adapter. The injected SDK must have GET retries disabled.
// No environment, app client, CRM synchronization, Redis or business writer imports.
const {UUID,fail,exact,phone,variants,integer,text,date,months,unavailable}=require('./contracts.cjs');
const COLUMNS=Object.freeze({
 customers:'id,zalo_id,phone,name,birthday',
 players:'id,user_id,phone,phone_number,zalo_user_id,name,display_name,profile_changed_at,crm_tier,total_points,member_activated,crm_spend_alltime,crm_spend_weekly,crm_spend_monthly,crm_spend_quarterly,crm_spend_yearly,crm_orders_alltime,crm_synced_at,is_blocked',
 partner_monthly_spending:'user_id,year_month,total_spent,qualified,updated_at'
});
function createAccountReader({enabled=false,db,now=Date.now}={}){
 if(typeof enabled!=='boolean'||(enabled&&typeof db?.from!=='function'))throw fail('ACCOUNT_UNAVAILABLE');
 let active=0;
 async function rows(table,filter,limit,signal){
  const q=db.from(table).select(COLUMNS[table],{count:'exact'});filter(q);
  // Explicit opt-out even when the SDK client is configured with a retry policy.
  const result=await q.limit(limit).retry(false).abortSignal(signal);
  if(result.error||!Array.isArray(result.data)||!Number.isSafeInteger(result.count)||result.count<0||result.count!==result.data.length||result.data.length>limit)throw fail('ACCOUNT_DATA_UNAVAILABLE');
  const expected=COLUMNS[table].split(',');
  if(result.data.some(r=>!exact(r,expected)))throw fail('ACCOUNT_DATA_UNAVAILABLE');return result.data;
 }
 async function read(body){
  if(!enabled)throw fail('ACCOUNT_READ_DISABLED');
  if(!exact(body,['customerId'])||!UUID.test(body.customerId))throw fail('ACCOUNT_INVALID');
  if(active>=2)throw fail('TRY_LATER');active++;
  try{
   const signal=AbortSignal.timeout(7000);
   const found=await rows('customers',q=>q.eq('id',body.customerId),2,signal);
   if(found.length!==1)throw fail('ACCOUNT_IDENTITY_CONFLICT');const c=found[0];
   if(c.id!==body.customerId||typeof c.zalo_id!=='string'||!/^\d{1,64}$/.test(c.zalo_id))throw fail('ACCOUNT_IDENTITY_CONFLICT');
   const p=phone(c.phone);
   // Refuse phone recycling/duplicates and provider identity reassignment before any balance read.
   const byPhone=await rows('customers',q=>q.in('phone',variants(p)),2,signal);
   const byProvider=await rows('customers',q=>q.eq('zalo_id',c.zalo_id),2,signal);
   for(const group of [byPhone,byProvider])if(group.length!==1||group[0].id!==c.id||group[0].zalo_id!==c.zalo_id||phone(group[0].phone)!==p)throw fail('ACCOUNT_IDENTITY_CONFLICT');
   const players=await rows('players',q=>q.eq('user_id',p),2,signal);
   if(players.length>1)throw fail('ACCOUNT_IDENTITY_CONFLICT');const player=players[0];
   if(player){integer(player.id);if(player.user_id!==p)throw fail('ACCOUNT_IDENTITY_CONFLICT');for(const field of ['phone','phone_number'])if(player[field]!==null&&phone(player[field])!==p)throw fail('ACCOUNT_IDENTITY_CONFLICT');if(player.zalo_user_id!==null&&player.zalo_user_id!==c.zalo_id)throw fail('ACCOUNT_IDENTITY_CONFLICT');if(player.is_blocked!==false&&player.is_blocked!==null)throw fail('ACCOUNT_BLOCKED');}
   const at=date(new Date(now()).toISOString()),sections={};
   const safely=(name,fn)=>{try{sections[name]=fn();}catch{sections[name]=unavailable('DATA_INVALID');}};
   safely('profile',()=>{const name=player?.display_name??player?.name??c.name;const birthday=c.birthday;if(birthday!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(birthday)||!Number.isFinite(Date.parse(birthday))))throw fail('ACCOUNT_DATA_UNAVAILABLE');return {state:'available',source:'customer-player-snapshot',name:text(name),birthday,phoneMasked:p.slice(0,3)+'****'+p.slice(-3)};});
   safely('membership',()=>{if(!player||typeof player.member_activated!=='boolean')throw fail('ACCOUNT_DATA_UNAVAILABLE');return {state:'snapshot',source:'players',tier:text(player.crm_tier),activated:player.member_activated,syncedAt:date(player.crm_synced_at)};});
   safely('points',()=>{if(!player)throw fail('ACCOUNT_DATA_UNAVAILABLE');return {state:'snapshot',source:'players.total_points',points:integer(player.total_points),observedAt:at};});
   safely('spending',()=>{if(!player)throw fail('ACCOUNT_DATA_UNAVAILABLE');return {state:'snapshot',source:'players.crm_spend',alltime:integer(player.crm_spend_alltime),weekly:integer(player.crm_spend_weekly),monthly:integer(player.crm_spend_monthly),quarterly:integer(player.crm_spend_quarterly),yearly:integer(player.crm_spend_yearly),orders:integer(player.crm_orders_alltime),syncedAt:date(player.crm_synced_at)};});
   try{
    const periods=months(now()),partner=await rows('partner_monthly_spending',q=>q.eq('user_id',p).in('year_month',periods),3,signal);
    if(new Set(partner.map(r=>r.year_month)).size!==partner.length||partner.some(r=>r.user_id!==p||!periods.includes(r.year_month)||typeof r.qualified!=='boolean'))throw fail('ACCOUNT_DATA_UNAVAILABLE');
    // Missing rows stay unknown. Do not manufacture zero spending or promotion rights.
    const values=periods.map(period=>{const r=partner.find(r=>r.year_month===period);return r?{period,state:'snapshot',spent:integer(r.total_spent),qualified:r.qualified,updatedAt:date(r.updated_at)}:{period,state:'unavailable'};});
    sections.partner={state:'snapshot',source:'partner_monthly_spending',months:values};
   }catch{sections.partner=unavailable('DATA_INVALID');}
   sections.vouchers=unavailable('VOUCHER_OWNER_MAPPING_REQUIRED');
   sections.orderHistory=unavailable('ORDER_OWNER_AND_CRM_MAPPING_REQUIRED');
   const finalCustomer=await rows('customers',q=>q.eq('id',body.customerId),2,signal);
   if(finalCustomer.length!==1||finalCustomer[0].id!==c.id||finalCustomer[0].zalo_id!==c.zalo_id||phone(finalCustomer[0].phone)!==p)throw fail('ACCOUNT_IDENTITY_CONFLICT');
   return {snapshot:{contract:'native-account-read-v1',observedAt:at,complete:false,sections},identity:{customerId:c.id,phone:p,zaloId:c.zalo_id}};
  }catch(e){throw fail(['ACCOUNT_IDENTITY_CONFLICT','ACCOUNT_BLOCKED','TRY_LATER'].includes(e?.code)?e.code:'ACCOUNT_UNAVAILABLE');}
  finally{active--;}
 }
 return {read:async body=>(await read(body)).snapshot,readInternal:read};
}
module.exports={createAccountReader,COLUMNS};
