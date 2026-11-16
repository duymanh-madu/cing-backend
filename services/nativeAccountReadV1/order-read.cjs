'use strict';
const {exact,fail,phone,integer,text,date}=require('./contracts.cjs');
const ORDER_COLUMNS='id,user_id,customer_phone,order_code,created_at,total_amount,status,payment_status,payment_method,items,order_type,ipos_order_id';
// Called only inside the Production adapter after canonical customer/player ownership checks.
// The native request must never provide this server-only phone or construct a query.
function createOrderReader({enabled=false,db}={}){
 if(typeof enabled!=='boolean'||(enabled&&typeof db?.from!=='function'))throw fail('ORDER_UNAVAILABLE');
 return {async read(body){
  if(!enabled)throw fail('ORDER_READ_DISABLED');
  if(!exact(body,['ownerPhone','offset'])||!Number.isSafeInteger(body.offset)||body.offset<0||body.offset>10000||body.offset%50!==0)throw fail('ORDER_INVALID');
  const owner=phone(body.ownerPhone);
  try{
   const r=await db.from('orders').select(ORDER_COLUMNS,{count:'exact'}).eq('user_id',owner)
    .order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).range(body.offset,body.offset+49).retry(false).abortSignal(AbortSignal.timeout(7000));
   if(r.error||!Array.isArray(r.data)||!Number.isSafeInteger(r.count)||r.count<0||r.data.length!==Math.min(50,Math.max(0,r.count-body.offset)))throw fail('ORDER_UNAVAILABLE');
   const seen=new Set(),rows=r.data.map(row=>{
    if(!exact(row,ORDER_COLUMNS.split(','))||row.user_id!==owner||phone(row.customer_phone)!==owner)throw fail('ORDER_OWNER_CONFLICT');
    const id=String(integer(row.id));if(seen.has(id))throw fail('ORDER_UNAVAILABLE');seen.add(id);
    if(!Array.isArray(row.items)||row.items.length>200)throw fail('ORDER_UNAVAILABLE');
    const items=row.items.map(item=>{if(!item||typeof item!=='object'||Array.isArray(item))throw fail('ORDER_UNAVAILABLE');
     const name=text(item.name??item.product_name,250),quantity=integer(item.quantity),unitPrice=integer(item.price);
     if(!name||quantity<1||quantity>10000)throw fail('ORDER_UNAVAILABLE');return {name,quantity,unitPrice};});
    return {id:'app_'+id,source:'app',code:text(row.order_code),createdAt:date(row.created_at),amount:integer(row.total_amount),
     status:text(row.status),paymentStatus:text(row.payment_status),paymentMethod:text(row.payment_method),orderType:text(row.order_type),
     items,iposReference:text(row.ipos_order_id,200)};
   });
   return {source:'app-orders',rows,offset:body.offset,total:r.count,hasMore:body.offset+rows.length<r.count,
    complete:body.offset===0&&rows.length===r.count,pagination:'offset-not-atomic',iposReconciliation:'not-verified'};
  }catch(e){throw fail(e?.code==='ORDER_OWNER_CONFLICT'?'ORDER_OWNER_CONFLICT':'ORDER_UNAVAILABLE');}
 }};
}
module.exports={createOrderReader,ORDER_COLUMNS};
