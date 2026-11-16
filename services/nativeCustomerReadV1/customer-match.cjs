'use strict';
// Internal offline building block only. No HTTP route, database client or linking write.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function fail(code){return Object.assign(new Error(code),{code});}
function normalizePhone(value){
 if(typeof value!=='string')throw fail('MATCH_REJECTED');
 if(/^0[35789][0-9]{8}$/.test(value))return value;
 if(/^84[35789][0-9]{8}$/.test(value))return '0'+value.slice(2);
 if(/^\+84[35789][0-9]{8}$/.test(value))return '0'+value.slice(3);
 throw fail('MATCH_REJECTED');
}
function exact(value,keys){return value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');}
function validId(value){return typeof value==='string'&&/^[0-9]{1,64}$/.test(value);}
function candidates(result){
 if(!exact(result,['complete','rows'])||result.complete!==true||!Array.isArray(result.rows)||result.rows.length>2)throw fail('MATCH_UNAVAILABLE');
 const ids=new Set();
 for(const row of result.rows){
  if(!exact(row,['id','zalo_id','phone'])||typeof row.id!=='string'||!UUID.test(row.id)||!validId(row.zalo_id)||ids.has(row.id))throw fail('MATCH_UNAVAILABLE');
  ids.add(row.id);
  try{normalizePhone(row.phone);}catch{throw fail('MATCH_UNAVAILABLE');}
 }
 return result.rows;
}
function createCustomerMatchReviewer({verifyProof,lookupByZaloId,lookupByPhone}){
 if([verifyProof,lookupByZaloId,lookupByPhone].some(fn=>typeof fn!=='function'))throw fail('MATCH_UNAVAILABLE');
 return async function review(input){
  if(!exact(input,['miniAccessToken','phoneToken'])||Object.values(input).some(v=>typeof v!=='string'||!/^[\x21-\x7e]{1,4096}$/.test(v)))throw fail('MATCH_REJECTED');
  let proof;
  try{proof=await verifyProof(input);}catch{throw fail('PROOF_REJECTED');}
  if(!exact(proof,['verified','zaloUserId','phone'])||proof.verified!==true||!validId(proof.zaloUserId))throw fail('PROOF_REJECTED');
  let phone;
  try{phone=normalizePhone(proof.phone);}catch{throw fail('PROOF_REJECTED');}
  // Adapters MUST perform exhaustive normalized lookups; complete=true is a trusted adapter contract.
  // Returning only a first match, a truncated page or a legacy cached phone is forbidden.
  let byId,byPhone;
  try{
   byId=candidates(await lookupByZaloId(proof.zaloUserId));
   byPhone=candidates(await lookupByPhone(phone));
  }catch{throw fail('MATCH_UNAVAILABLE');}
  if(!byId.length&&!byPhone.length)throw fail('CUSTOMER_NOT_FOUND');
  if(byId.length!==1||byPhone.length!==1)throw fail('CUSTOMER_CONFLICT');
  const a=byId[0],b=byPhone[0];
  if(a.id!==b.id||a.zalo_id!==proof.zaloUserId||b.zalo_id!==proof.zaloUserId||normalizePhone(a.phone)!==phone||normalizePhone(b.phone)!==phone)throw fail('CUSTOMER_CONFLICT');
  // Internal result only; not browser-facing and never a login/link authorization.
  return Object.freeze({customerId:a.id,reviewOnly:true,linkCreated:false,sessionIssued:false});
 };
}
module.exports={createCustomerMatchReviewer,normalizePhone};
