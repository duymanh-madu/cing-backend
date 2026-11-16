'use strict';
const {finance,exact,fail}=require('./funding.cjs');
const COLUMNS={players:'user_id,crm_tier,total_points,is_blocked',cing_wallet_accounts:'user_id,balance,status',app_configs:'id,loyalty_point_value_vnd,app_status,maintenance_mode,ordering_enabled,payment_enabled,allowed_payment_methods'};
const integer=v=>{
 if(typeof v==='string'&&!/^(0|[1-9][0-9]*)$/.test(v))throw fail('FUNDING_UNAVAILABLE');
 if(!['number','string'].includes(typeof v)||!Number.isSafeInteger(Number(v))||Number(v)<0||Number(v)>1e12)throw fail('FUNDING_UNAVAILABLE');return Number(v);
};
function createFinanceReader({enabled=false,db,ownerReader}){
 let pending=0;
 async function readRows(table,userId){
  let q=db.from(table).select(COLUMNS[table],{count:'exact'});
  if(userId!==null)q=q.eq('user_id',userId);
  const r=await q.limit(2).retry(false).abortSignal(AbortSignal.timeout(7000));
  if(r.error||!Array.isArray(r.data)||r.count!==r.data.length||r.data.length>1||!Number.isSafeInteger(r.count)||r.data.some(v=>!exact(v,COLUMNS[table].split(','))))throw fail('FUNDING_UNAVAILABLE');return r.data;
 }
 return {async read({customerId}){
  if(enabled!==true)throw fail('FUNDING_DISABLED');
  if(typeof customerId!=='string'||!(/^[a-f0-9-]{36}$/).test(customerId))throw fail('FUNDING_INVALID');
  if(pending>=2)throw fail('TRY_LATER');pending++;
  try{
   const before={...(await ownerReader.readInternal({customerId})).identity};
   if(!before||before.customerId!==customerId||!/^0[35789][0-9]{8}$/.test(before.phone)||!/^\d{1,64}$/.test(before.zaloId))throw fail('ACCOUNT_IDENTITY_CONFLICT');
   const phone=before.phone;
   const [players,wallets,policies]=await Promise.all([readRows('players',phone),readRows('cing_wallet_accounts',phone),readRows('app_configs',null)]);
   if(players.length!==1||policies.length!==1||players[0].user_id!==phone||(wallets.length&&wallets[0].user_id!==phone))throw fail('ACCOUNT_IDENTITY_CONFLICT');
   const player=players[0],wallet=wallets[0],p=policies[0];
   if(player.is_blocked!==false&&player.is_blocked!==null)throw fail('ACCOUNT_BLOCKED');
   if(!Array.isArray(p.allowed_payment_methods)||p.allowed_payment_methods.some(x=>typeof x!=='string')||new Set(p.allowed_payment_methods).size!==p.allowed_payment_methods.length)throw fail('FUNDING_UNAVAILABLE');
   integer(p.id);
   const snapshot=finance({tier:typeof player.crm_tier==='string'&&player.crm_tier.trim()?player.crm_tier.trim().toLowerCase():'member',points:integer(player.total_points),pointValueVnd:integer(p.loyalty_point_value_vnd),wallet:wallet?{balance:integer(wallet.balance),status:wallet.status,accountCreated:true}:{balance:0,status:'active',accountCreated:false},policy:{appStatus:p.app_status,maintenance:p.maintenance_mode,ordering:p.ordering_enabled,payment:p.payment_enabled,walletAllowed:p.allowed_payment_methods.includes('cing_wallet')}});
   const after=(await ownerReader.readInternal({customerId})).identity;
   if(['customerId','phone','zaloId'].some(k=>before[k]!==after?.[k]))throw fail('ACCOUNT_IDENTITY_CONFLICT');
   return snapshot;
  }catch(e){throw fail(['ACCOUNT_BLOCKED','ACCOUNT_IDENTITY_CONFLICT','TRY_LATER'].includes(e?.code)?e.code:'FUNDING_UNAVAILABLE');}
  finally{pending--;}
 }};
}
module.exports={createFinanceReader,COLUMNS};
