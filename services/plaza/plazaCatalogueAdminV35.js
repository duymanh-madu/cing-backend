"use strict";
function fail(code){throw Object.assign(new Error(code),{code});}
function createPlazaCatalogueAdminV35({supabase}){
 async function operate(admin,input={},update=false){
  if(!admin?.id||admin.type==='customer'||admin.role!=='super_admin')fail('PLAZA_SUPER_ADMIN_REQUIRED');
  const {data:current,error}=await supabase.from('admins').select('id,role,active').eq('id',admin.id).maybeSingle();
  if(error||current?.active!==true||current?.role!=='super_admin')fail('PLAZA_SUPER_ADMIN_REQUIRED');
  if(!update){const r=await supabase.from('cing_plaza_appearance_items_v27').select('id,slot,label,price_coin,enabled,character,revision').order('id').limit(200);if(r.error)fail('PLAZA_CATALOGUE_UNAVAILABLE');return {items:r.data};}
  if(!/^[a-z0-9_]{1,64}$/.test(input.itemId||'')||!Number.isSafeInteger(input.priceCoin)||input.priceCoin<0||input.priceCoin>1000000||typeof input.enabled!=='boolean'||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||typeof input.reason!=='string'||input.reason.trim().length<5||input.reason.length>500||!/^[-0-9a-f]{36}$/i.test(input.commandId||''))fail('PLAZA_INVALID_REQUEST');
  const r=await supabase.rpc('cing_plaza_catalogue_admin_set_v35',{p_admin_id:String(current.id),p_item_id:input.itemId,p_price_coin:input.priceCoin,p_enabled:input.enabled,p_expected_revision:input.expectedRevision,p_reason:input.reason.trim(),p_command_id:input.commandId});
  if(r.error)fail(/^PLAZA_[A-Z_]+$/.test(r.error.message||'')?r.error.message:'PLAZA_CATALOGUE_UNAVAILABLE');return {item:r.data};
 }return {operate};
}module.exports={createPlazaCatalogueAdminV35};
