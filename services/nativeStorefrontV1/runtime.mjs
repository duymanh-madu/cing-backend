import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createStoreReadRpc,createLegacyMenuReader,createStoreReadSource} from './production-source.mjs';
import {createDirectoryService,projectRegistry} from './server/directory.mjs';
import {createStoreHandler} from './server/http.mjs';
import {createAddressProvider} from './server/google.mjs';
import {createProviderBudget} from './budget.mjs';
const require=createRequire(import.meta.url);
export function createRuntime(env,deps={}){
 const db=deps.db||require('../../supabase');
 const source=createStoreReadSource({enabled:true,rpc:deps.rpc||createStoreReadRpc(db),readLegacyMenu:deps.readLegacyMenu||createLegacyMenuReader(db),legacy:{storeId:'26458fb4-6aa6-497b-afae-a62f1fbd7436',posParent:env.IPOS_POS_PARENT,posId:env.IPOS_POS_ID}});
 async function readRegistry(){
  const value=await source.readRegistry();
  let operations;
  if(deps.readOperations)operations=await deps.readOperations();
  else{const r=await db.from('app_configs').select('id,app_status,maintenance_mode,ordering_enabled',{count:'exact'}).eq('id',1).range(0,1).retry(false).abortSignal(AbortSignal.timeout(7000));if(r.error||r.count!==1||r.data?.length!==1)throw Error('STORES_UNAVAILABLE');operations=r.data[0]}
  if(operations?.id!==1||typeof operations.app_status!=='string'||typeof operations.maintenance_mode!=='boolean'||typeof operations.ordering_enabled!=='boolean')throw Error('STORES_UNAVAILABLE');
  const accepting=operations.app_status==='active'&&!operations.maintenance_mode&&operations.ordering_enabled;
  const rows=value.rows.map(row=>{const m=row.metadata?.native_storefront;if(!m)return row;return {...row,metadata:{native_storefront:{...m,checkoutReady:false,...(row.id===value.defaultStoreId?{acceptingOrders:accepting}:{})}}}});
  const revision=Number.parseInt(createHash('sha256').update(JSON.stringify([value.revision,rows])).digest('hex').slice(0,13),16)+1;
  return {...value,rows,revision};
 }
 // No Google or Redis connection is constructed before the DB gate and published registry pass.
 let provider,budget;
 async function admit(){const snapshot=await readRegistry();projectRegistry(snapshot.rows,snapshot);if(!provider)provider=deps.provider||createAddressProvider({key:env.GOOGLE_MAPS_PLACES_API_KEY,transport:deps.transport||globalThis.fetch});if(!budget){if(deps.budget)budget=deps.budget;else{const Redis=require('ioredis');if(typeof env.REDIS_URL!=='string'||!/^rediss?:\/\//.test(env.REDIS_URL))throw Error('TRY_LATER');const redis=new Redis(env.REDIS_URL,{lazyConnect:true,enableOfflineQueue:false,maxRetriesPerRequest:0,retryStrategy:()=>null,reconnectOnError:()=>false,connectTimeout:3000,commandTimeout:3000});redis.on('error',()=>{});budget=createProviderBudget(redis)}}await budget()}
 const service=createDirectoryService({enabled:true,readRegistry,readMenu:source.readMenu,searchAddress:async query=>{await admit();return provider.searchAddress(query)},resolveAddress:async id=>{await admit();return provider.resolveAddress(id)}});
 return createStoreHandler({enabled:true,service});
}
