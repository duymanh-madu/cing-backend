const test = require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup({points=120,cached=null,dbError=null}={}) {
 const routes=[],seen=[]; const router={get:(...args)=>routes.push(args)};
 const db={from:table=>({select:()=>({eq:(field,id)=>{seen.push({table,field,id});return {maybeSingle:async()=>({data:points===undefined?null:{total_points:points},error:dbError})};}})})};
 const mocks={'express':{Router:()=>router},'../services/infrastructure/cache/redisClient':{get:async()=>cached},'../services/foodbook':{getMember:()=>{throw Error('CRM should not run for cache hit');}},'../services/partnerProgressService':{},'../services/loyalty/loyaltyExternalPointSnapshotService':{},'../middlewares/authMiddleware':(req,res,next)=>{if(!req.customer)return res.status(401).json({success:false});next();},'../services/games/cingBlockPuzzle/cingBlockPuzzleSessionService':{resolveAuthenticatedUserId:c=>c.phone},'../supabase':db};
 vm.runInNewContext(fs.readFileSync('routes/membershipRoutes.js','utf8'),{require:n=>{if(!(n in mocks))throw Error(n);return mocks[n];},module:{exports:{}},console:{log(){},warn(){},error(){}},Date,Number,JSON,Math,String,Promise});
 return {routes,seen};
}
function response(){return {code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};}
test('live balance is authenticated and ignores supplied owner',async()=>{
 const {routes,seen}=setup();const [,auth,handler]=routes.find(r=>r[0]==='/balance/current');const unauthorized=response();let next=false;auth({},unauthorized,()=>next=true);assert.equal(unauthorized.code,401);assert.equal(next,false);
 const res=response();await handler({customer:{phone:'0900000000'},query:{phone:'0999999999'}},res);assert.equal(res.body.data.points,120);assert.deepEqual(seen,[{table:'players',field:'user_id',id:'0900000000'}]);assert.equal(res.headers['Cache-Control'],'private, no-store');
});
test('cached tier metadata does not cache a stale points balance',async()=>{
 const {routes}=setup({points:120,cached:JSON.stringify({points:100,tierKey:'gold',name:'Member'})});const handler=routes.find(r=>r[0]==='/:phone')[1];const res=response();await handler({params:{phone:'84900000000'}},res);assert.equal(res.body.data.points,120);assert.equal(res.body.data.tierKey,'gold');
});
test('canonical read failures never invent zero',async()=>{
 for(const options of [{points:null},{points:-1},{points:1.5},{dbError:Error('offline')}]){
 const {routes}=setup(options);const handler=routes.find(r=>r[0]==='/balance/current')[2];const res=response();await handler({customer:{phone:'0900000000'}},res);assert.ok(res.code>=400);assert.equal(res.body.success,false);assert.equal(res.body.data,undefined);
 }
});
