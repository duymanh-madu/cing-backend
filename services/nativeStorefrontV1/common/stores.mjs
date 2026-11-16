// Public store contract. POS identities, integration keys and internal metadata never cross this boundary.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail=code=>Object.assign(new Error(code),{code});
export const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const text=(s,max)=>typeof s==='string'&&s.trim()===s&&s.length>0&&s.length<=max&&!/[\x00-\x1f\x7f]/.test(s);
export function point(p){if(!exact(p,['latitude','longitude'])||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180)throw fail('LOCATION_INVALID');return Object.freeze({...p});}
export function publicStore(s){
 if(!exact(s,['id','revision','name','address','location','hotline','hours','acceptingOrders','menuReady','checkoutReady'])||!UUID.test(s.id)||!Number.isSafeInteger(s.revision)||s.revision<1||!text(s.name,100)||!text(s.address,250)||!(s.hotline===null||/^\+?[0-9]{8,15}$/.test(s.hotline))||!(s.hours===null||text(s.hours,250))||[s.acceptingOrders,s.menuReady,s.checkoutReady].some(v=>typeof v!=='boolean')||s.checkoutReady&&(!s.menuReady||!s.acceptingOrders))throw fail('STORE_CONTRACT_INVALID');
 return Object.freeze({...s,location:s.location===null?null:point(s.location)});
}
export function directory(v){
 if(!exact(v,['contract','revision','defaultStoreId','stores'])||v.contract!=='native-stores-v1'||!Number.isSafeInteger(v.revision)||v.revision<1||!Array.isArray(v.stores)||v.stores.length<1||v.stores.length>100)throw fail('STORE_CONTRACT_INVALID');
 const stores=v.stores.map(publicStore);if(new Set(stores.map(s=>s.id)).size!==stores.length||!stores.some(s=>s.id===v.defaultStoreId))throw fail('STORE_CONTRACT_INVALID');
 return Object.freeze({...v,stores:Object.freeze(stores),showStoreSelector:stores.length>1});
}
export function distanceMeters(from,to){
 from=point(from);to=point(to);const rad=n=>n*Math.PI/180;
 const a=Math.sin(rad(to.latitude-from.latitude)/2)**2+Math.cos(rad(from.latitude))*Math.cos(rad(to.latitude))*Math.sin(rad(to.longitude-from.longitude)/2)**2;
 return 6371008.8*2*Math.atan2(Math.sqrt(Math.min(1,Math.max(0,a))),Math.sqrt(Math.max(0,1-a)));
}
export function nearest(stores,origin){
 origin=point(origin);
 return stores.map(publicStore).map(store=>Object.freeze({store,distanceMeters:store.location===null?null:distanceMeters(origin,store.location)})).sort((a,b)=>(a.distanceMeters===null?1:0)-(b.distanceMeters===null?1:0)||(a.distanceMeters??0)-(b.distanceMeters??0)||a.store.id.localeCompare(b.store.id));
}
export function menuEnvelope(v,expected){
 if(!exact(v,['contract','storeId','storeRevision','menuRevision','items'])||v.contract!=='native-store-menu-v1'||v.storeId!==expected.id||v.storeRevision!==expected.revision||!text(v.menuRevision,100)||!Array.isArray(v.items)||v.items.length>500)throw fail('STORE_MENU_INVALID');
 const ids=new Set();
 for(const item of v.items){if(!exact(item,['id','name','price','image','category','active','customizations'])||!text(item.id,100)||ids.has(item.id)||!text(item.name,150)||!Number.isSafeInteger(item.price)||item.price<0||typeof item.active!=='boolean'||typeof item.image!=='string'||item.image.length>1000||typeof item.category!=='string'||item.category.length>100||!Array.isArray(item.customizations))throw fail('STORE_MENU_INVALID');ids.add(item.id);}
 for(const item of v.items){
  if(item.customizations.length>30)throw fail('STORE_MENU_INVALID');
  const used=new Set();
  for(const group of item.customizations){
   if(!exact(group,['name','min','max','options'])||!text(group.name,250)||!Number.isSafeInteger(group.min)||!Number.isSafeInteger(group.max)||group.min<0||group.max<group.min||group.max>100||!Array.isArray(group.options)||group.options.length>100||group.min>group.options.length)throw fail('STORE_MENU_INVALID');
   for(const option of group.options){if(!exact(option,['id','name','price'])||!text(option.id,100)||used.has(option.id)||!text(option.name,250)||!Number.isSafeInteger(option.price)||option.price<0)throw fail('STORE_MENU_INVALID');used.add(option.id)}
  }
 }
 return structuredClone(v);
}
// Client selection is a draft action, never authority for pricing, POS routing or settlement.
export function createStoreSelection({initial,cartCount,clearCart,invalidateQuotes}){
 let value=publicStore(initial),version=0,pending=null;const listeners=new Set();
 function emit(){for(const fn of listeners)fn(value);}
 return Object.freeze({
  current:()=>value,subscribe(fn){listeners.add(fn);fn(value);return()=>listeners.delete(fn)},
  propose(next){next=publicStore(next);if(next.id===value.id&&next.revision===value.revision)return {changed:false,confirmationRequired:false};pending={next,version};return {changed:false,confirmationRequired:cartCount()>0};},
  confirm({accepted=false}={}){
   if(!pending||pending.version!==version)throw fail('STORE_SELECTION_STALE');
   if(cartCount()>0&&!accepted)throw fail('STORE_CART_CONFIRMATION_REQUIRED');
   const next=pending.next;clearCart();invalidateQuotes();value=next;version++;pending=null;emit();return value;
  },
  cancel(){pending=null},invalidate(){version++;pending=null;invalidateQuotes();}
 });
}
export function checkoutBinding(input,store){
 store=publicStore(store);
 if(!exact(input,['storeId','storeRevision','menuRevision','intentHash'])||input.storeId!==store.id||input.storeRevision!==store.revision||!text(input.menuRevision,100)||!/[a-f0-9]{64}/.test(input.intentHash)||input.intentHash.length!==64||!store.checkoutReady)throw fail('STORE_CHECKOUT_NOT_READY');
 return Object.freeze({...input});
}
