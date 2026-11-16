'use strict';
const {timingSafeEqual}=require('node:crypto');
const nativeOrigins=new Set(['capacitor://localhost','https://localhost','http://localhost']);
const fail=code=>Object.assign(new Error(code),{code});
const errors={FUNDING_DISABLED:503,FUNDING_INVALID:400,FUNDING_UNAVAILABLE:503,FUNDING_SELECTION_CHANGED:409,QUOTE_INVALID:400,SESSION_INVALID:401,ACCOUNT_NOT_LINKED:409,ACCOUNT_IDENTITY_CONFLICT:409,ACCOUNT_BLOCKED:403,QUOTE_READ_DISABLED:503,QUOTE_DISABLED:503,QUOTE_ITEM_UNAVAILABLE:409,QUOTE_SELECTION_CHANGED:409,QUOTE_UNAVAILABLE:503,TRY_LATER:429,BODY_TOO_LARGE:413,UNSUPPORTED_CONTENT_TYPE:415};
function readJson(req){return new Promise((resolve,reject)=>{let done=false,size=0;const chunks=[];const timer=setTimeout(()=>stop('QUOTE_INVALID'),5000);
 function stop(code){if(done)return;done=true;clearTimeout(timer);req.resume();reject(fail(code));}
 if(req.headers['content-encoding']||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))return stop('UNSUPPORTED_CONTENT_TYPE');
 if(Number(req.headers['content-length']||0)>16384)return stop('BODY_TOO_LARGE');
 req.on('error',()=>stop('QUOTE_INVALID'));req.on('aborted',()=>stop('QUOTE_INVALID'));req.on('data',chunk=>{if(done)return;size+=chunk.length;if(size>16384)return stop('BODY_TOO_LARGE');chunks.push(chunk);});req.on('end',()=>{if(done)return;let body;try{body=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{return stop('QUOTE_INVALID');}done=true;clearTimeout(timer);resolve(body);});
 });}
function createQuoteHandler({enabled=false,mode="native",privateKey,service}={}){
 const internal=mode==='internal',prefix=internal?'/internal/native-commerce-preview-v1':'/commerce/preview',path=internal?prefix:prefix+'/read';
 if(typeof enabled!=='boolean'||(enabled&&typeof service?.read!=='function')||(enabled&&internal&&!/^[a-f0-9]{64}$/.test(privateKey)))throw fail('QUOTE_UNAVAILABLE');let active=0,count=0,start=Date.now();
 return async(req,res)=>{if(!req.url.startsWith(prefix))return false;
  function reply(status,body){req.resume();let raw=JSON.stringify(body);if(Buffer.byteLength(raw)>131072){status=503;raw='{"success":false,"code":"QUOTE_UNAVAILABLE"}';}res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Cing-Quote-Release':"d6c99c4d0616ba5eb5cb7f218341182be7a142fd1071c4ccd01bd3ac13105486",'X-Cing-Funding-Release':"609b91fbfebe09e152cedbbdb383960f3e731e2ae9e35a152b3075674e167020",'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",Connection:'close'});res.end(raw);return true;}
  if(!enabled||req.url!==path)return reply(404,{success:false,code:'ROUTE_NOT_ENABLED'});
  const origin=req.headers.origin;if(internal){
   if(origin!==undefined||req.headers['sec-fetch-site']!==undefined||req.headers['sec-fetch-user']!==undefined||req.headers['sec-fetch-dest']!==undefined||req.headers.cookie!==undefined)return reply(403,{success:false,code:'ORIGIN_NOT_ALLOWED'});
   const auth=req.headers.authorization;if(typeof auth!=='string'||!/^Bearer [a-f0-9]{64}$/.test(auth)||!timingSafeEqual(Buffer.from(auth.slice(7)),Buffer.from(privateKey)))return reply(401,{success:false,code:'UNAUTHORIZED'});
  }else{
   if(origin!==undefined&&!nativeOrigins.has(origin))return reply(403,{success:false,code:'ORIGIN_NOT_ALLOWED'});
   if(req.headers.authorization!==undefined||req.headers.cookie!==undefined)return reply(400,{success:false,code:'QUOTE_INVALID'});
   if(origin!==undefined){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   if(req.method==='OPTIONS'){const headers=String(req.headers['access-control-request-headers']||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);if(req.headers['access-control-request-method']!=='POST'||headers.some(k=>!['accept','content-type'].includes(k)))return reply(405,{success:false,code:'PREFLIGHT_NOT_ALLOWED'});res.writeHead(204,{'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Accept, Content-Type','Cache-Control':'no-store',Connection:'close'});res.end();return true;}
  }
  if(req.method!=='POST')return reply(405,{success:false,code:'METHOD_NOT_ALLOWED'});
  if(Date.now()-start>=60000){start=Date.now();count=0;}if(active>=2||count>=20)return reply(429,{success:false,code:'TRY_LATER'});active++;count++;
  try{return reply(200,await service.read(await readJson(req)));}catch(e){const code=Object.hasOwn(errors,e?.code||'')?e.code:'QUOTE_UNAVAILABLE';return reply(errors[code],{success:false,code});}finally{active--;}
 };
}
module.exports={createQuoteHandler};
