'use strict';
const {timingSafeEqual}=require('node:crypto');
const {createCustomerMatchReviewer}=require('./customer-match.cjs');
const PATH='/internal/native-customer-read-v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function createMiddleware(config,{verifyProof,lookupByZaloId,lookupByPhone}={}){
 if(config.enabled!==true&&config.enabled!==false)throw Error('NATIVE_READ_CONFIGURATION_REQUIRED');
 let expected,review;
 if(config.enabled){
  if(typeof config.readBridgeKey!=='string'||!/^[a-f0-9]{64}$/.test(config.readBridgeKey))throw Error('NATIVE_READ_CONFIGURATION_REQUIRED');
  expected=Buffer.from('Bearer '+config.readBridgeKey);
  review=createCustomerMatchReviewer({verifyProof,lookupByZaloId,lookupByPhone});
 }
 const consumed=new Map();let active=0,count=0,windowStart=Date.now();
 return async function nativeRead(req,res,next){
  if(!req.url.startsWith(PATH))return next();
  const reply=(status,code,data={})=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify({success:status===200,...(code?{code}:{}),...data}));};
  const reject=(status,code)=>{req.resume();reply(status,code);};
  if(!config.enabled)return reject(404,'ROUTE_NOT_ENABLED');
  if(req.url!==PATH)return reject(404,'ROUTE_NOT_ENABLED');
  if(req.headers.origin!==undefined||req.headers['sec-fetch-site']!==undefined)return reject(403,'BROWSER_NOT_ALLOWED');
  if(req.method!=='POST')return reject(405,'METHOD_NOT_ALLOWED');
  const supplied=Buffer.from(String(req.headers.authorization||''));
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reject(401,'UNAUTHORIZED');
  const now=Date.now();if(now-windowStart>=60000){count=0;windowStart=now;}
  if(active>=2||count>=60)return reject(429,'TRY_LATER');
  count++;active++;
  try{
   const body=await readBody(req);
   if(!body||Object.getPrototypeOf(body)!==Object.prototype||Object.keys(body).sort().join(',')!=='miniAccessToken,pairingId,phoneToken,requestId'||typeof body.requestId!=='string'||!UUID.test(body.requestId)||typeof body.pairingId!=='string'||!UUID.test(body.pairingId))return reply(400,'INVALID_REQUEST');
   for(const [id,expiry] of consumed)if(expiry<=Date.now())consumed.delete(id);
   if(consumed.has(body.requestId))return reply(409,'REQUEST_ALREADY_USED');
   if(consumed.size>=256)return reply(429,'TRY_LATER');
   // Claim before awaiting proof; even ambiguous failures must not retry a phone token.
   consumed.set(body.requestId,Date.now()+300000);
   const result=await review({miniAccessToken:body.miniAccessToken,phoneToken:body.phoneToken});
   return reply(200,null,{matched:true,customerId:result.customerId,pairingId:body.pairingId,requestId:body.requestId,customerLinkingEnabled:false,sessionIssued:false});
  }catch(error){
   const codes={INVALID_REQUEST:400,BODY_TOO_LARGE:413,UNSUPPORTED_CONTENT_TYPE:415,MATCH_REJECTED:400,PROOF_REJECTED:401,CUSTOMER_NOT_FOUND:409,CUSTOMER_CONFLICT:409,MATCH_UNAVAILABLE:503};
   const code=Object.hasOwn(codes,error?.code)?error.code:'MATCH_UNAVAILABLE';reply(codes[code],code);
  }finally{active--;}
 };
}
function readBody(req){return new Promise((resolve,reject)=>{
 let done=false,bytes=0;const chunks=[];
 const fail=code=>{if(done)return;done=true;clearTimeout(timer);req.resume();reject(Object.assign(Error(code),{code}));};
 const timer=setTimeout(()=>fail('INVALID_REQUEST'),4000);
 if(req.headers['content-encoding']||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))return fail('UNSUPPORTED_CONTENT_TYPE');
 if(Number(req.headers['content-length']||0)>16384)return fail('BODY_TOO_LARGE');
 req.on('error',()=>fail('INVALID_REQUEST'));req.on('aborted',()=>fail('INVALID_REQUEST'));
 req.on('data',chunk=>{if(done)return;bytes+=chunk.length;if(bytes>16384)return fail('BODY_TOO_LARGE');chunks.push(chunk);});
 req.on('end',()=>{if(done)return;let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return fail('INVALID_REQUEST');}done=true;clearTimeout(timer);resolve(body);});
});}
// Only this explicit startup factory touches the existing Production client.
// Module import and disabled startup do not load it or make any request.
function createProductionMiddleware(){
 const enabled=process.env.CING_NATIVE_CUSTOMER_READ_ENABLED;
 if(enabled===undefined||enabled==='false')return createMiddleware({enabled:false});
 if(enabled!=='true')throw Error('NATIVE_READ_CONFIGURATION_REQUIRED');
 const readKey=process.env.CING_NATIVE_CUSTOMER_READ_BRIDGE_KEY,proofKey=process.env.CING_NATIVE_ZALO_PROOF_BRIDGE_KEY;
 if(!/^[a-f0-9]{64}$/.test(readKey||'')||!/^[a-f0-9]{64}$/.test(proofKey||'')||readKey===proofKey)throw Error('NATIVE_READ_CONFIGURATION_REQUIRED');
 const {createProofClient}=require('./proof-client.cjs');
 const verifyProof=createProofClient(proofKey);
 const {createCustomerReadAdapter}=require('./customer-read-adapter.cjs');
 const client=require('../../supabase');
 const adapter=createCustomerReadAdapter(client);
 return createMiddleware({enabled:true,readBridgeKey:readKey},{...adapter,verifyProof});
}
module.exports={createMiddleware,createProductionMiddleware,PATH};
