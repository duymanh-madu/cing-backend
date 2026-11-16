import {createHash} from 'node:crypto';
import {exact,publicStore,menuEnvelope} from './common/stores.mjs';
const fail=code=>Object.assign(new Error(code),{code});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID=/^ITEM-[A-Za-z0-9_-]{1,100}$/;
const price=n=>{if(typeof n==='string'&&/^\d+$/.test(n))n=Number(n);if(!Number.isSafeInteger(n)||n<0||n>1000000000)throw fail('STORE_MENU_INVALID');return n};
function normalize(row){
 if(!row||!ID.test(row.store_item_id)||row.active!==true||typeof row.name!=='string')throw fail('STORE_MENU_INVALID');
 const groups=row.raw_data?.customizations??[];if(!Array.isArray(groups))throw fail('STORE_MENU_INVALID');
 return {id:row.store_item_id,name:row.name,price:price(row.price),image:typeof row.image==='string'?row.image:'',category:typeof row.category==='string'?row.category:'',active:true,customizations:groups.map(g=>{
  if(!g||!Array.isArray(g.options))throw fail('STORE_MENU_INVALID');
  return {name:g.name||'Tùy chọn',min:g.min_permitted??0,max:g.max_permitted??g.options.length,options:g.options.filter(o=>o?.status==='ACTIVE').map(o=>({id:o.id,name:o.name,price:price(o.ta_price??o.ots_price??0)}))};
 })};
}
export function createStoreReadRpc(db){
 return async(name,args={})=>{
  if(!['cing_native_storefront_registry_v1','cing_native_storefront_menu_v1'].includes(name)||name.endsWith('registry_v1')&&!exact(args,[])||name.endsWith('menu_v1')&&(!exact(args,['p_store_id'])||!UUID.test(args.p_store_id)))throw fail('STORE_REQUEST_INVALID');
  try{const reply=await db.rpc(name,args).retry(false).abortSignal(AbortSignal.timeout(10000));if(reply?.error||!reply?.data)throw fail('STORES_UNAVAILABLE');return reply.data}catch{throw fail('STORES_UNAVAILABLE')}
 };
}
export function createLegacyMenuReader(db){
 return async()=>{
  try{const r=await db.from('menu_items').select('id,store_item_id,name,category,price,image,active,raw_data',{count:'exact'}).eq('active',true).order('id').range(0,499).retry(false).abortSignal(AbortSignal.timeout(10000));if(r?.error||!Array.isArray(r?.data)||!Number.isSafeInteger(r.count)||r.count!==r.data.length||r.count<1||r.count>500)throw fail('STORE_MENU_INVALID');return {rows:r.data,total:r.count,complete:true}}catch{throw fail('STORES_UNAVAILABLE')}
 };
}
// `legacy` is a reviewed server assertion. It must never be taken from an HTTP body.
export function createStoreReadSource({enabled=false,rpc,readLegacyMenu,legacy}={}){
 if(typeof enabled!=='boolean')throw fail('STORE_CONFIGURATION_INVALID');
 if(enabled&&(!exact(legacy,['storeId','posParent','posId'])||!UUID.test(legacy.storeId)||![legacy.posParent,legacy.posId].every(s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(s))))throw fail('STORE_CONFIGURATION_INVALID');
 function gate(){if(!enabled)throw fail('STORES_DISABLED')}
 return Object.freeze({
  async readRegistry(){gate();const p=await rpc('cing_native_storefront_registry_v1',{});if(exact(p,['enabled'])&&p.enabled===false)throw fail('STORES_DISABLED');if(!exact(p,['enabled','defaultStoreId','revision','rows'])||p.enabled!==true||p.defaultStoreId!==legacy.storeId||!Number.isSafeInteger(p.revision)||p.revision<1||!Array.isArray(p.rows)||p.rows.length>100)throw fail('STORES_UNAVAILABLE');const owner=p.rows.filter(s=>s.id===legacy.storeId&&s.pos_parent===legacy.posParent&&s.pos_id===legacy.posId&&s.active===true);if(owner.length!==1)throw fail('STORE_UNAVAILABLE');return {rows:p.rows,revision:p.revision,defaultStoreId:p.defaultStoreId}},
  async readMenu(binding){
   gate();if(!exact(binding,['store','registryId','posParent','posId']))throw fail('STORE_REQUEST_INVALID');const store=publicStore(binding.store);if(store.id!==binding.registryId)throw fail('STORE_REQUEST_INVALID');
   const p=await rpc('cing_native_storefront_menu_v1',{p_store_id:store.id});
   if(p?.enabled!==true||p.storeId!==store.id||p.posParent!==binding.posParent||p.posId!==binding.posId)throw fail('STORE_MENU_INVALID');
   let items,menuRevision;
   if(p.source==='legacy-default'){
    if(!exact(p,['enabled','source','storeId','posParent','posId'])||store.id!==legacy.storeId||binding.posParent!==legacy.posParent||binding.posId!==legacy.posId)throw fail('STORE_MENU_INVALID');
    const r=await readLegacyMenu();if(!exact(r,['rows','total','complete'])||r.complete!==true||!Array.isArray(r.rows)||r.total!==r.rows.length||r.total<1||r.total>500)throw fail('STORE_MENU_INVALID');
    items=r.rows.map(normalize);menuRevision='legacy-'+createHash('sha256').update(JSON.stringify(items)).digest('hex');
   }else if(p.source==='store-snapshot'){
    if(!exact(p,['enabled','source','storeId','posParent','posId','menuRevision','items'])||store.id===legacy.storeId)throw fail('STORE_MENU_INVALID');items=p.items;menuRevision=p.menuRevision;
   }else throw fail('STORE_MENU_INVALID');
   const result=menuEnvelope({contract:'native-store-menu-v1',storeId:store.id,storeRevision:store.revision,menuRevision,items},store);
   return {posParent:binding.posParent,posId:binding.posId,menuRevision:result.menuRevision,items:result.items};
  }
 });
}
