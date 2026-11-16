'use strict';
// Dormant internal adapter. Inject an already-configured Production client on the
// Production backend only. Never import a database client or read env here.
const {normalizePhone}=require('./customer-match.cjs');
const fail=()=>Object.assign(new Error('MATCH_UNAVAILABLE'),{code:'MATCH_UNAVAILABLE'});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function rows(result){
 if(!result||result.error||!Number.isSafeInteger(result.count)||result.count<0||!Array.isArray(result.data)||result.data.length>2||result.count!==result.data.length)throw fail();
 const ids=new Set();
 for(const row of result.data){
  if(!row||Object.getPrototypeOf(row)!==Object.prototype||Object.keys(row).sort().join(',')!=='id,phone,zalo_id'||typeof row.id!=='string'||!UUID.test(row.id)||ids.has(row.id)||typeof row.zalo_id!=='string'||!/^[0-9]{1,64}$/.test(row.zalo_id))throw fail();
  try{normalizePhone(row.phone);}catch{throw fail();}
  ids.add(row.id);
 }
 return {complete:true,rows:result.data.map(row=>({...row}))};
}
function createCustomerReadAdapter(client){
 if(!client||typeof client.from!=='function')throw fail();
 let active=0;
 async function lookup(filter){
  if(active>=4)throw fail();
  active++;
  try{
   const base=client.from('customers').select('id,zalo_id,phone',{count:'exact'});
   const query=filter(base).limit(2).retry(false).abortSignal(AbortSignal.timeout(7000));
   return rows(await query);
  }catch{throw fail();}finally{active--;}
 }
 return Object.freeze({
  async lookupByZaloId(id){
   if(typeof id!=='string'||!/^[0-9]{1,64}$/.test(id))throw fail();
   const result=await lookup(query=>query.eq('zalo_id',id));
   if(result.rows.some(row=>row.zalo_id!==id))throw fail();
   return result;
  },
  async lookupByPhone(input){
   let phone;try{phone=normalizePhone(input);}catch{throw fail();}
   const variants=[phone,'84'+phone.slice(1),'+84'+phone.slice(1)];
   const result=await lookup(query=>query.in('phone',variants));
   if(result.rows.some(row=>normalizePhone(row.phone)!==phone))throw fail();
   return result;
  },
 });
}
module.exports={createCustomerReadAdapter};
