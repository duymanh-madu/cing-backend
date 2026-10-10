"use strict";
function createPlazaActivityReadV16({supabase}){
 async function authorize(admin){if(!admin?.id||admin.type==='customer')throw Object.assign(new Error('Forbidden'),{statusCode:403});const result=await supabase.from('admins').select('id,role,active').eq('id',admin.id).maybeSingle();if(result.error||result.data?.active!==true||!['admin','super_admin'].includes(result.data.role))throw Object.assign(new Error('Forbidden'),{statusCode:403});}
 async function read(admin,{page=1,limit=50,search=''}={}){
  await authorize(admin);page=Number(page);limit=Number(limit);if(!Number.isSafeInteger(page)||page<1||page>10000)page=1;if(!Number.isSafeInteger(limit)||limit<1)limit=50;limit=Math.min(limit,100);
  const result=await supabase.rpc('cing_plaza_activity_read_v16',{p_search:String(search).trim().slice(0,100),p_offset:(page-1)*limit,p_limit:limit+1});if(result.error)throw new Error('Không thể đọc nhật ký Cing Plaza');
  const rows=result.data||[];return {success:true,data:rows.slice(0,limit).map(r=>({...r,_type:'plaza',user_id:r.member_id,reason:r.event_name})),page,limit,has_more:rows.length>limit};
 }
 return {read,authorize};
}module.exports={createPlazaActivityReadV16};
