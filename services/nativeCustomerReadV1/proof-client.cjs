'use strict';
const URL='https://game.madu.com.vn/native-staging-zalo-proof-v1/internal/zalo-proof';
const fail=()=>Object.assign(Error('PROOF_UNAVAILABLE'),{code:'PROOF_UNAVAILABLE'});
function createProofClient(key,transport=fetch){
 if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw fail();
 return async input=>{
  try{
   const response=await transport(URL,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(input),redirect:'error',signal:AbortSignal.timeout(10000)});
   let bytes=0;const chunks=[];
   for await(const chunk of response.body){bytes+=chunk.length;if(bytes>8192)throw fail();chunks.push(Buffer.from(chunk));}
   if(!response.ok)throw fail();
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!data||Object.keys(data).sort().join(',')!=='customerLinkingEnabled,phone,success,verified,zaloUserId'||data.success!==true||data.verified!==true||data.customerLinkingEnabled!==false)throw fail();
   return {verified:true,zaloUserId:data.zaloUserId,phone:data.phone};
  }catch{throw fail();}
 };
}
module.exports={createProofClient};
