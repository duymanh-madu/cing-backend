'use strict';
const {fail}=require('./contract.cjs');
async function bounded(r,max=524288){if(!r?.headers||!/^application\/json(?:\s*;|$)/i.test(r.headers.get('content-type')||''))throw fail('ACTIVITY_UNAVAILABLE');const reader=r.body?.getReader();if(!reader)throw fail('ACTIVITY_UNAVAILABLE');const chunks=[];let size=0;for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>max){await reader.cancel();throw fail('ACTIVITY_UNAVAILABLE');}chunks.push(Buffer.from(x.value));}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('ACTIVITY_UNAVAILABLE');}}
module.exports={bounded};
