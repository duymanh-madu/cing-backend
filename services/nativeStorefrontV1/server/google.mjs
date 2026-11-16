import {point} from '../common/stores.mjs';
const fail=()=>Object.assign(new Error('SEARCH_INVALID'),{code:'SEARCH_INVALID'});
export function createAddressProvider({key,transport=globalThis.fetch}={}){
 if(typeof key!=='string'||key.length<20||key.length>250||/[\s\x00-\x1f\x7f]/.test(key))throw fail();
 async function request(url,method,fields,body){
  const response=await transport(url,{method,headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':fields,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok||!/^application\/json\b/i.test(response.headers.get('content-type')||''))throw fail();
  const reader=response.body?.getReader();if(!reader)throw fail();let size=0;const chunks=[];
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>64000){await reader.cancel();throw fail()}chunks.push(part.value)}}finally{reader.releaseLock()}
  try{const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||parsed.error)throw fail();return parsed}catch{throw fail()}
 }
 return Object.freeze({
  async searchAddress(query){
   if(typeof query!=='string'||query.trim()!==query||query.length<3||query.length>150||/[\x00-\x1f\x7f]/.test(query))throw fail();
   const p=await request('https://places.googleapis.com/v1/places:autocomplete','POST','suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',{input:query,includedRegionCodes:['vn'],languageCode:'vi'});
   if(!Array.isArray(p.suggestions)||p.suggestions.length>5)throw fail();
   return p.suggestions.map(row=>{const x=row?.placePrediction;if(!x||typeof x.placeId!=='string'||!/^[A-Za-z0-9_-]{1,256}$/.test(x.placeId)||typeof x.text?.text!=='string'||x.text.text.length>250||/[\x00-\x1f\x7f]/.test(x.text.text))throw fail();return {placeId:x.placeId,label:x.text.text}});
  },
  async resolveAddress(id){
   if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,256}$/.test(id))throw fail();
   const p=await request('https://places.googleapis.com/v1/places/'+encodeURIComponent(id),'GET','id,location');
   if(p.id!==id)throw fail();return point(p.location);
  }
 });
}
