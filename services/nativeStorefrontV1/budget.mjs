const fail=()=>Object.assign(new Error('TRY_LATER'),{code:'TRY_LATER'});
// A shared Redis budget limits paid Google calls across replicas. Never queue or retry calls while Redis is unavailable.
const SCRIPT=`local a=tonumber(redis.call('GET',KEYS[1]) or '0');local b=tonumber(redis.call('GET',KEYS[2]) or '0');if a>=tonumber(ARGV[1]) or b>=tonumber(ARGV[2]) then return 0 end;redis.call('INCR',KEYS[1]);redis.call('EXPIRE',KEYS[1],120);redis.call('INCR',KEYS[2]);redis.call('EXPIRE',KEYS[2],172800);return 1`;
export function createProviderBudget(redis,{now=Date.now,minuteLimit=20,dayLimit=500}={}){
 if(!Number.isSafeInteger(minuteLimit)||minuteLimit<1||minuteLimit>60||!Number.isSafeInteger(dayLimit)||dayLimit<1||dayLimit>5000)throw fail();let connecting=null;
 return async()=>{
  try{
   if(!connecting&&['wait','end'].includes(redis.status))connecting=redis.connect().finally(()=>{connecting=null});
   if(connecting)await connecting
   if(redis.status!=='ready')throw fail();
   const time=now(),keys=['cing:{storefront-google}:minute:'+Math.floor(time/60000),'cing:{storefront-google}:day:'+Math.floor(time/86400000)];
   const result=await redis.eval(SCRIPT,2,...keys,String(minuteLimit),String(dayLimit));if(Number(result)!==1)throw fail();
  }catch{throw fail()}
 };
}
