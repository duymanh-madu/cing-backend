'use strict';
// Read-only iPOS client. No application/worker/Redis imports, no logging or writes.
const fail=(code='CRM_UNAVAILABLE')=>Object.assign(new Error(code),{code});
const BASE='https://api.foodbook.vn';
const routes=Object.freeze({member:'/ipos/ws/xpartner/membership_detail',vouchers:'/ipos/ws/xpartner/member_vouchers',history:'/ipos/ws/xpartner/member_transactions'});
function ownerPhone(v){if(typeof v!=='string'||!/^0[35789][0-9]{8}$/.test(v))throw fail('CRM_INVALID');return v;}
function providerPhone(v){if(typeof v==='number'){if(!Number.isSafeInteger(v)||v<0)throw fail('CRM_IDENTITY_CONFLICT');v=String(v);if(/^[35789][0-9]{8}$/.test(v))v='0'+v;}
 if(typeof v!=='string')throw fail('CRM_IDENTITY_CONFLICT');if(v.startsWith('+84'))v='0'+v.slice(3);else if(v.startsWith('84'))v='0'+v.slice(2);
 if(!/^0[35789][0-9]{8}$/.test(v))throw fail('CRM_IDENTITY_CONFLICT');return v;}
function string(v,max=250,empty=true,multiline=false){if(typeof v!=='string'||v.length>max||(!empty&&!v.length)||(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(v))throw fail('CRM_DATA_INVALID');return v;}
function integer(v){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw fail('CRM_DATA_INVALID');return v;}
function decimal(v,signed=false){if(typeof v==='string'){if(!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,40})?$/.test(v)||v.length>60)throw fail('CRM_DATA_INVALID');if(v.startsWith('-')){if(!signed)throw fail('CRM_DATA_INVALID');return '-'+decimal(v.slice(1));}if(BigInt(v.split('.')[0])>BigInt(Number.MAX_SAFE_INTEGER))throw fail('CRM_DATA_INVALID');return v;}if(typeof v==='number'&&v<0&&signed)return '-'+decimal(-v);if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>Number.MAX_SAFE_INTEGER)throw fail('CRM_DATA_INVALID');let s=String(v);const m=s.match(/^(\d)(?:\.(\d+))?e([+-]?\d+)$/);if(m){const digits=m[1]+(m[2]||''),position=1+Number(m[3]);if(position<-20||position>20)throw fail('CRM_DATA_INVALID');s=position<=0?'0.'+'0'.repeat(-position)+digits:position>=digits.length?digits+'0'.repeat(position-digits.length):digits.slice(0,position)+'.'+digits.slice(position);}if(!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,40})?$/.test(s))throw fail('CRM_DATA_INVALID');return s;}
function vnDate(v){string(v,19,false);if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v))throw fail('CRM_DATA_INVALID');const iso=v.replace(' ','T')+'+07:00',time=Date.parse(iso);if(!Number.isFinite(time)||new Date(time+7*3600000).toISOString().slice(0,19)!==v.replace(' ','T'))throw fail('CRM_DATA_INVALID');return iso;}
function envelope(p){if(!p||typeof p!=='object'||Array.isArray(p)||!Object.hasOwn(p,'data'))throw fail('CRM_RESPONSE_INVALID');
 for(const [k,v]of Object.entries(p)){if(k==='data')continue;const key=k.replace(/_/g,'').toLowerCase();
  if(['errorcode','errcode','resultcode','statuscode','code'].includes(key)){if(typeof v!=='number'||![0,200].includes(v))throw fail('CRM_PROVIDER_REJECTED');}
  else if(['error','haserror'].includes(key)){if(v!==false&&v!==0&&v!==null&&v!=='')throw fail('CRM_PROVIDER_REJECTED');}
  else if(['success','issuccess'].includes(key)){if(v!==true&&v!==1)throw fail('CRM_PROVIDER_REJECTED');}
  else if(key==='status'&&typeof v==='boolean'){if(!v)throw fail('CRM_PROVIDER_REJECTED');}
  else if(/err|code|success/.test(key)&&!['errormessage','errmsg','errmessage','messageerror'].includes(key))throw fail('CRM_RESPONSE_INVALID');
 }
 return p.data;
}
function member(p,owner,parent){const d=envelope(p);if(!d||typeof d!=='object'||Array.isArray(d)||providerPhone(d.phone_number)!==owner||d.pos_parent!==parent)throw fail('CRM_IDENTITY_CONFLICT');
 return {source:'ipos-member',name:string(d.name),tierName:string(d.membership_type_name),crmPoints:decimal(d.point,true),paymentAmount:decimal(d.payment_amount,true),pointAmount:decimal(d.point_amount,true),visits:integer(d.eat_times)};
}
function vouchers(p,parent){const rows=envelope(p);if(!Array.isArray(rows)||rows.length>2000)throw fail('CRM_RESPONSE_INVALID');const seen=new Set();
 return {source:'ipos-vouchers',coverage:'provider-returned-list',rows:rows.map(v=>{
  if(!v||v.pos_parent!==parent)throw fail('CRM_IDENTITY_CONFLICT');const code=string(v.voucher_code,128,false);if(seen.has(code))throw fail('CRM_DATA_INVALID');seen.add(code);
  return {code,campaignId:integer(v.voucher_campaign_id),campaignName:string(v.voucher_campaign_name,500),description:string(v.voucher_description,4000,true,true),
   startsAt:vnDate(v.date_start),endsAt:vnDate(v.date_end),createdAt:vnDate(v.date_created),discountType:integer(v.discount_type),discountAmount:decimal(v.discount_amount),discountRate:decimal(v.discount_extra),providerStatus:integer(v.status)};
 })};
}
function history(p,parent,page){const d=envelope(p);if(!d||typeof d!=='object'||Array.isArray(d)||!Array.isArray(d.sale_logs))throw fail('CRM_RESPONSE_INVALID');
 const total=integer(d.count),expected=Math.min(20,Math.max(0,total-(page-1)*20));if(d.sale_logs.length!==expected)throw fail('CRM_PAGE_INCOMPLETE');const seen=new Set();
 const rows=d.sale_logs.map(t=>{
  if(!t||t.pos_parent!==parent)throw fail('CRM_IDENTITY_CONFLICT');const posId=integer(t.pos_id),transactionId=string(t.tran_id,200,false),id=parent+':'+posId+':'+transactionId;
  if(seen.has(id))throw fail('CRM_DATA_INVALID');seen.add(id);
  if(!Array.isArray(t.sale_details)||t.sale_details.length>200||!Array.isArray(t.payment_info)||t.payment_info.length>20||!Array.isArray(t.channels)||t.channels.length>30)throw fail('CRM_DATA_INVALID');
  const items=t.sale_details.map(i=>{const quantity=decimal(i.Quantity,true);return {name:string(i.Description,500,false),quantity,unitPrice:decimal(i.Price_Sale,true)};});
  return {id,source:'ipos',transactionId,posId,code:string(t.tran_no,200),createdAt:vnDate(t.tran_date),amount:decimal(t.bill_amount,true),
   items,payments:t.payment_info.map(x=>({name:string(x.name,120),amount:decimal(x.amount,true)})),channels:t.channels.map(c=>string(c.name,120)),posName:string(t.pos_name,250),saleType:string(t.sale_type,100)};
 });
 return {source:'ipos-history',page,pageSize:20,total,rows,hasMore:page*20<total,complete:page===1&&rows.length===total,consistency:'paged-non-atomic'};
}
async function json(response,signal){if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||'')||!response.body)throw fail('CRM_RESPONSE_INVALID');let size=0;const chunks=[];
 const reader=response.body.getReader();try{while(true){if(signal.aborted)throw fail();const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw fail('CRM_RESPONSE_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw fail('CRM_RESPONSE_INVALID');}
}
function createCrmReader({key,parent}={},transport=globalThis.fetch){
 if(typeof key!=='string'||!/^[\x21-\x7e]{1,4096}$/.test(key)||typeof parent!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(parent)||typeof transport!=='function')throw fail('CRM_CONFIGURATION_INVALID');
 let active=0;
 async function request(kind,owner,page){ownerPhone(owner);if(!Object.hasOwn(routes,kind)|| (kind==='history'&&(!Number.isSafeInteger(page)||page<1||page>50)))throw fail('CRM_INVALID');if(active>=2)throw fail('TRY_LATER');active++;
  const signal=AbortSignal.timeout(10000),url=new URL(BASE+routes[kind]);url.searchParams.set('pos_parent',parent);url.searchParams.set('user_id',owner);if(kind==='history')url.searchParams.set('page',page);
  try{const response=await transport(url.href,{method:'GET',headers:{Accept:'application/json',access_token:key},redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal});
   if(response.status!==200||response.redirected||(response.url&&response.url!==url.href))throw fail('CRM_PROVIDER_REJECTED');return await json(response,signal);
  }catch(e){throw fail(['CRM_RESPONSE_INVALID','CRM_RESPONSE_TOO_LARGE','CRM_PROVIDER_REJECTED'].includes(e?.code)?e.code:'CRM_UNAVAILABLE');}finally{active--;}
 }
 async function owned(owner){const raw=await request('member',owner);return member(raw,owner,parent);}
 return {
  member:owned,
  async vouchers(owner){await owned(owner);return vouchers(await request('vouchers',owner),parent);},
  async historyPage(owner,page=1){ownerPhone(owner);if(!Number.isSafeInteger(page)||page<1||page>50)throw fail('CRM_INVALID');await owned(owner);return history(await request('history',owner,page),parent,page);},
  // Operator-only verification helper, not a native runtime endpoint. Max five history pages.
  async verifyContract(owner){let step='member';try{await owned(owner);step='vouchers';const v=vouchers(await request('vouchers',owner),parent);let total=null,pages=0;const ids=new Set();
   for(let page=1;page<=5;page++){step='history-page-'+page;const result=history(await request('history',owner,page),parent,page);pages++;
    if(total===null)total=result.total;else if(result.total!==total)throw fail('CRM_TOTAL_CHANGED');
    for(const row of result.rows){if(ids.has(row.id))throw fail('CRM_DUPLICATE_PAGE');ids.add(row.id);}
    if(!result.hasMore)break;
   }
   step='member-recheck';await owned(owner);return {contract:'native-crm-read-v1',memberValidated:true,voucherRows:v.rows.length,historyPages:pages,historyTotal:total,historyRows:ids.size,historyCoverage:ids.size===total?'count-and-identities-validated':'bounded-partial',snapshotAtomic:false};
   }catch(e){throw Object.assign(fail(e?.code||'CRM_UNAVAILABLE'),{step});}
  }
 };
}
module.exports={createCrmReader,providerPhone,vnDate,decimal,envelope,member,vouchers,history,routes};
