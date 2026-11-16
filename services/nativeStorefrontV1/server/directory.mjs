import {directory,publicStore,exact,point,menuEnvelope} from '../common/stores.mjs';
const fail=code=>Object.assign(new Error(code),{code});
const hidden=()=>{throw fail('STORE_UNAVAILABLE')};
const posText=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
// The existing cing_wallet_pos_stores registry owns identity. A storefront is metadata, not another POS registry.
export function projectRegistry(rows,{revision,defaultStoreId}){
 if(!Array.isArray(rows)||rows.length>100)throw fail('STORE_REGISTRY_INVALID');
 const ids=new Set(),pos=new Set(),stores=[],bindings=new Map();
 for(const row of rows){
  if(!row||typeof row.active!=='boolean'||!posText(row.pos_parent)||!posText(row.pos_id)||ids.has(row.id)||pos.has(row.pos_parent+'\0'+row.pos_id))throw fail('STORE_REGISTRY_INVALID');
  ids.add(row.id);pos.add(row.pos_parent+'\0'+row.pos_id);
  const m=row.metadata?.native_storefront;
  if(!row.active||!m||m.published!==true)continue;
  if(!exact(m,['published','revision','address','location','hotline','hours','acceptingOrders','menuReady','checkoutReady']))throw fail('STORE_REGISTRY_INVALID');
  const store=publicStore({id:row.id,revision:m.revision,name:row.display_name,address:m.address,location:m.location,hotline:m.hotline,hours:m.hours,acceptingOrders:m.acceptingOrders,menuReady:m.menuReady,checkoutReady:m.checkoutReady});
  stores.push(store);bindings.set(store.id,Object.freeze({store,registryId:row.id,posParent:row.pos_parent,posId:row.pos_id}));
 }
 const payload=directory({contract:'native-stores-v1',revision,defaultStoreId,stores});
 return Object.freeze({payload,resolve:id=>bindings.get(id)||hidden()});
}
export function createDirectoryService({enabled=false,readRegistry,readMenu,searchAddress,resolveAddress}={}){
 if(typeof enabled!=='boolean')throw fail('STORE_CONFIGURATION_INVALID');
 let active=0;const maxActive=2;
 async function bounded(fn){if(!enabled)throw fail('STORES_DISABLED');if(active>=maxActive)throw fail('TRY_LATER');active++;try{return await fn()}catch(e){throw fail(['STORES_DISABLED','STORE_UNAVAILABLE','STORE_MENU_INVALID','LOCATION_INVALID','SEARCH_INVALID','TRY_LATER'].includes(e?.code)?e.code:'STORES_UNAVAILABLE')}finally{active--;}}
 async function registry(){const r=await readRegistry();return projectRegistry(r.rows,{revision:r.revision,defaultStoreId:r.defaultStoreId})}
 return Object.freeze({
  list:()=>bounded(async()=>{const {payload}=await registry();const {showStoreSelector,...wire}=payload;return wire}),
  menu:id=>bounded(async()=>{
   const before=await registry(),binding=before.resolve(id);if(!binding.store.menuReady)throw fail('STORE_UNAVAILABLE');
   // The provider must bind both POS identities. Never fall back to the global/other-store menu.
   const source=await readMenu(binding);
   if(!exact(source,['posParent','posId','menuRevision','items'])||source.posParent!==binding.posParent||source.posId!==binding.posId)throw fail('STORE_MENU_INVALID');
   const after=await registry(),current=after.resolve(id);
   if(after.payload.revision!==before.payload.revision||JSON.stringify(current)!==JSON.stringify(binding))throw fail('STORE_UNAVAILABLE');
   return menuEnvelope({contract:'native-store-menu-v1',storeId:id,storeRevision:binding.store.revision,menuRevision:source.menuRevision,items:source.items},binding.store);
  }),
  search:input=>bounded(async()=>{
   if(!exact(input,['query'])||typeof input.query!=='string'||input.query.trim()!==input.query||input.query.length<3||input.query.length>150||/[\x00-\x1f\x7f]/.test(input.query))throw fail('SEARCH_INVALID');
   const rows=await searchAddress(input.query);if(!Array.isArray(rows)||rows.length>5)throw fail('SEARCH_INVALID');
   const ids=new Set();for(const r of rows){if(!exact(r,['placeId','label'])||typeof r.placeId!=='string'||!/^[A-Za-z0-9_-]{1,256}$/.test(r.placeId)||ids.has(r.placeId)||typeof r.label!=='string'||r.label.length<1||r.label.length>250||/[\x00-\x1f\x7f]/.test(r.label))throw fail('SEARCH_INVALID');ids.add(r.placeId)}return rows;
  }),
  resolve:input=>bounded(async()=>{
   if(!exact(input,['placeId'])||typeof input.placeId!=='string'||!/^[A-Za-z0-9_-]{1,256}$/.test(input.placeId))throw fail('SEARCH_INVALID');
   return point(await resolveAddress(input.placeId));
  })
 });
}
