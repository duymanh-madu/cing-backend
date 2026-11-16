const nativeOrigins=new Set(['capacitor://localhost','https://localhost','http://localhost']);
const routes=new Map([['/stores/directory',['GET','list']],['/stores/address/search',['POST','search']],['/stores/address/resolve',['POST','resolve']]]);
export function createStoreHandler({enabled=false,service,now=Date.now}={}){
 if(typeof enabled!=='boolean')throw Error('STORE_CONFIGURATION_INVALID');let minute=-1,reads=0,paidReads=0;
 return async(req,res)=>{
  if(!req.url?.startsWith('/stores'))return false;
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});res.end(JSON.stringify(data));return true};
  const error=(status,code)=>{req.resume();return reply(status,{success:false,code})};
  if(!enabled)return error(404,'STORES_DISABLED');
  const origin=req.headers.origin;
  if(origin&&!nativeOrigins.has(origin))return error(403,'ORIGIN_NOT_ALLOWED');
  if(req.headers.cookie||req.headers.authorization)return error(403,'CREDENTIALS_NOT_ALLOWED');
  const menu=/^\/stores\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/menu$/.exec(req.url);
  const route=routes.get(req.url)||(menu?['GET','menu']:null);if(!route)return error(404,'ROUTE_NOT_FOUND');
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
  if(req.method==='OPTIONS'){
   const headers=String(req.headers['access-control-request-headers']||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
   if(req.headers['access-control-request-method']!==route[0]||headers.some(h=>!['accept','content-type'].includes(h)))return error(405,'PREFLIGHT_NOT_ALLOWED');
   res.writeHead(204,{'Access-Control-Allow-Methods':route[0],'Access-Control-Allow-Headers':'Accept, Content-Type','Cache-Control':'no-store'});res.end();return true;
  }
  if(req.method!==route[0])return error(405,'METHOD_NOT_ALLOWED');
  if(route[0]==='GET'&&(Number(req.headers['content-length']||0)>0||req.headers['transfer-encoding']))return error(400,'BODY_NOT_ALLOWED');
  const bucket=Math.floor(now()/60000);if(bucket!==minute){minute=bucket;reads=0;paidReads=0}
  if(++reads>120||route[0]==='POST'&&++paidReads>20)return error(429,'TRY_LATER');
  let input;
  if(route[0]==='POST'){
   if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')||req.headers['content-encoding']||req.headers['content-length']&&!/^\d+$/.test(req.headers['content-length']))return error(415,'JSON_REQUIRED');
   if(Number(req.headers['content-length']||0)>2048)return error(413,'BODY_TOO_LARGE');
   let size=0;const chunks=[];
   let timer;try{await Promise.race([(async()=>{for await(const chunk of req){size+=chunk.length;if(size>2048)throw Error('BOUND');chunks.push(chunk)}})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('TIMEOUT')),5000)})]);input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{return error(400,'BODY_INVALID')}finally{clearTimeout(timer)}
  }
  try{const payload=await service[route[1]](menu?menu[1]:input);return reply(200,{success:true,payload})}catch(e){const code=['STORES_DISABLED','STORE_UNAVAILABLE','STORE_MENU_INVALID','LOCATION_INVALID','SEARCH_INVALID','TRY_LATER'].includes(e?.code)?e.code:'STORES_UNAVAILABLE';return error(code==='STORES_DISABLED'?404:code==='TRY_LATER'?429:code==='SEARCH_INVALID'||code==='LOCATION_INVALID'?400:503,code)}
 };
}
