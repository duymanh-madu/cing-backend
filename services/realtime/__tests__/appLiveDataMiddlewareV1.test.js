const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {appLiveDataMiddleware,domainsForMutation}=require('../../../middlewares/appLiveDataMiddleware');
const wait=()=>new Promise(resolve=>setTimeout(resolve,125));
test('successful mutations broadcast after response completion, containing domain hints only',async()=>{
 const old=global.io,events=[];global.io={emit:(...args)=>events.push(args)};
 try{
 const res=new EventEmitter();res.statusCode=200;let continued=false;
 appLiveDataMiddleware({method:'POST',originalUrl:'/api/game/cing-block-puzzle/session/private-id/submit'},res,()=>continued=true);
 assert.equal(continued,true);assert.equal(events.length,0);res.emit('finish');await wait();
 assert.equal(events.length,1);assert.equal(events[0][0],'app.data.changed');assert.ok(events[0][1].domains.includes('leaderboard'));assert.deepEqual(Object.keys(events[0][1]),['domains']);assert.ok(!JSON.stringify(events).includes('private-id'));
 }finally{global.io=old;}
});
test('reads, rejected mutations and auth refresh never generate change broadcasts',async()=>{
 const old=global.io,events=[];global.io={emit:(...args)=>events.push(args)};
 try{for(const [method,url,statusCode]of [['GET','/api/leaderboard/top-games/test',200],['POST','/api/checkout/create',400],['POST','/api/auth/refresh',200]]){const res=new EventEmitter();res.statusCode=statusCode;appLiveDataMiddleware({method,originalUrl:url},res,()=>{});res.emit('finish');}await wait();assert.equal(events.length,0);}finally{global.io=old;}
 assert.deepEqual(domainsForMutation('/api/auth/refresh'),[]);
});
test('burst completions coalesce domains instead of emitting duplicate payload snapshots',async()=>{
 const old=global.io,events=[];global.io={emit:(...args)=>events.push(args)};
 try{for(const url of ['/api/menu/update','/api/orders/update']){const res=new EventEmitter();res.statusCode=200;appLiveDataMiddleware({method:'PATCH',originalUrl:url},res,()=>{});res.emit('finish');}await wait();assert.equal(events.length,1);assert.ok(events[0][1].domains.includes('menu'));assert.ok(events[0][1].domains.includes('orders'));}finally{global.io=old;}
});
