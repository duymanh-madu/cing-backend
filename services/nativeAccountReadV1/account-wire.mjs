export const fail=code=>Object.assign(new Error(code),{code});
export async function boundedJson(r,limit=524288){
 if(!/^application\/json(?:\s*;|$)/i.test(r.headers.get('content-type')||'')||!r.body?.getReader)throw fail('ACCOUNT_UNAVAILABLE');
 const reader=r.body.getReader();let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw fail('ACCOUNT_UNAVAILABLE');}chunks.push(value);}}finally{reader.releaseLock();}
 const b=new Uint8Array(size);let o=0;for(const v of chunks){b.set(v,o);o+=v.length;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));}catch{throw fail('ACCOUNT_UNAVAILABLE');}
}
export const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
export const validPage=(section,page)=>['summary','vouchers','orders'].includes(section)&&Number.isInteger(page)&&page>=1&&page<=50&&(section==='orders'||page===1);
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
