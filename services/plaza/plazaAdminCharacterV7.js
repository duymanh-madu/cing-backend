"use strict";
function fail(code){throw Object.assign(new Error(code),{code});}
function createPlazaAdminCharacterV7({supabase}){
 async function operate(admin,input,update=false){
  if(!admin?.id || admin.role!=='super_admin' || admin.type==='customer')fail('PLAZA_SUPER_ADMIN_REQUIRED');
  const {data:current,error:authError}=await supabase.from('admins').select('id,role,active').eq('id',admin.id).maybeSingle();
  if(authError||current?.role!=='super_admin'||current.active!==true)fail('PLAZA_SUPER_ADMIN_REQUIRED');
  const phone=String(input.phone||'').trim();if(!/^0[0-9]{9}$/.test(phone))fail('PLAZA_INVALID_PHONE');
  const {data:customers,error:lookupError}=await supabase.from('customers').select('id,name,phone').or(`phone.eq.${phone},phone.eq.84${phone.slice(1)}`).limit(2);
  if(lookupError||customers?.length!==1)fail('PLAZA_CUSTOMER_NOT_FOUND');const memberId=String(customers[0].id);
  let args={p_member_id:memberId},rpc='cing_plaza_character_read_v7';
  if(update){if(!['boy','girl'].includes(input.character)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||typeof input.reason!=='string'||input.reason.trim().length<5||input.reason.length>500||!/^[-0-9a-f]{36}$/i.test(input.commandId||''))fail('PLAZA_INVALID_REQUEST');rpc='cing_plaza_character_admin_set_v7';args={...args,p_admin_id:String(current.id),p_character:input.character,p_expected_revision:input.expectedRevision,p_reason:input.reason.trim(),p_command_id:input.commandId};}
  const {data:profile,error}=await supabase.rpc(rpc,args);if(error)fail(/^PLAZA_[A-Z_]+$/.test(error.message||'')?error.message:'PLAZA_PROFILE_UNAVAILABLE');return {customer:customers[0],profile};
 }return {operate};
}module.exports={createPlazaAdminCharacterV7};
