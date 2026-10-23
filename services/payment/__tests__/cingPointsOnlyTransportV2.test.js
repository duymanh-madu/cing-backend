const test=require('node:test');
const assert=require('node:assert/strict');
const {sendPointsAwareIposOrder}=require('../../commerce/pointsOnlyIposTransport');
const payload={order_id:'same-order',PaymentInfo:{Amount:0,Payment_Method:'POINT',Payment_Info:'LOYALTY_POINTS',Trans_Verified:1}};
const rejection={data:{error:{message:'Invalid payment_method: POINT'}}};
test('explicit point tender rejection falls back once, preserving bill identity and zero amount',async()=>{
 const calls=[],logs=[]; const result=await sendPointsAwareIposOrder({order:{payment_method:'points',total_amount:0},payload,post:async body=>{calls.push(body);return calls.length===1?rejection:{data:{order_id:7}};},onFallback:async body=>logs.push(body)});
 assert.equal(calls.length,2);assert.equal(calls[1].order_id,payload.order_id);assert.equal(calls[1].PaymentInfo.Payment_Method,'MOMO_OD_ONLINE');assert.equal(calls[1].PaymentInfo.Amount,0);assert.equal(calls[1].PaymentInfo.Payment_Info,'LOYALTY_POINTS');assert.equal(logs.length,1);assert.equal(result.data.order_id,7);assert.equal(payload.PaymentInfo.Payment_Method,'POINT');
});
test('cash or mixed orders never use this fallback',async()=>{
 for(const order of [{payment_method:'points',total_amount:1},{payment_method:'momo',total_amount:0},{payment_method:'wallet',total_amount:0}]){
 let calls=0;await sendPointsAwareIposOrder({order,payload,post:async()=>{calls++;return rejection;},onFallback:()=>assert.fail('fallback')});assert.equal(calls,1);
 }
});
test('timeout is not replayed and unknown rejection is not changed',async()=>{
 let calls=0;await assert.rejects(()=>sendPointsAwareIposOrder({order:{payment_method:'points',total_amount:0},payload,post:async()=>{calls++;throw Error('timeout');},onFallback:()=>assert.fail()}));assert.equal(calls,1);
 calls=0;await sendPointsAwareIposOrder({order:{payment_method:'points',total_amount:0},payload,post:async()=>{calls++;return {data:{error:{message:'Outside business hours'}}};},onFallback:()=>assert.fail()});assert.equal(calls,1);
});
test('already on fallback never replays, even if iPOS rejects it',async()=>{
 let calls=0;await sendPointsAwareIposOrder({order:{payment_method:'points',total_amount:0},payload:{...payload,PaymentInfo:{...payload.PaymentInfo,Payment_Method:'MOMO_OD_ONLINE'}},post:async()=>{calls++;return rejection;},onFallback:()=>assert.fail()});assert.equal(calls,1);
});
test('explicit HTTP 422 tender rejection is eligible, other HTTP errors are not',async()=>{
 let calls=0;await sendPointsAwareIposOrder({order:{payment_method:'points',total_amount:0},payload,post:async()=>{calls++;if(calls===1)throw {response:{status:422,...rejection}};return {data:{order_id:7}};},onFallback:async()=>{}});assert.equal(calls,2);
});
test('actual iPOS payload keeps full discounts and zero tender for a 20,000đ / 19-point bill',()=>{
 const vm=require('node:vm'),fs=require('node:fs');const mod={exports:{}};
 const source=fs.readFileSync('services/iposOrderService.js','utf8');
 vm.runInNewContext(source+'\nmodule.exports.buildPayload=buildPayload;',{
  require:name=>name==='./commerce/pointsOnlyOperationalReadinessService'?{getConfiguredPointsPaymentMethod:()=> 'MOMO_OD_ONLINE'}:{},
  module:mod,process:{env:{IPOS_ACCESS_TOKEN:'fixture',IPOS_POS_PARENT:'fixture',IPOS_POS_ID:'1'}},console,
 });
 const base={id:1,order_code:'QA00000001',customer_phone:'0900000000',payment_method:'points',total_amount:0,subtotal:20000,tier_discount:1000,points_discount:19000,points_used:19,items:[]};
 const body=mod.exports.buildPayload(base);
 assert.equal(body.PaymentInfo.Payment_Method,'MOMO_OD_ONLINE');assert.equal(body.PaymentInfo.Payment_Info,'LOYALTY_POINTS');assert.equal(body.PaymentInfo.Amount,0);assert.equal(body.amount,0);assert.equal(body.total_amount,0);assert.equal(body.partner_voucher_info.discount_amount,20000);
 assert.throws(()=>mod.exports.buildPayload({...base,total_amount:1000}),/IPOS_POINTS_ONLY_AMOUNT_INVALID/);
});
