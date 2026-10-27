"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {projectC04OrdersV1}=require("../cingKdsC04OrderProjectionV1");
const {projectC03PaidOrdersV1}=require("../cingKdsC03PaidProjectionV1");
const {isEmptyPinObservationV1}=require("../cingKdsC04PinObservationV1");
const pin={"log_type": "LOG_USE_PIN", "tran_id": "LPP5ZL12GVQ8DSKS9ZS75NWN", "created_at": 1793109311, "updated_at": 1793109311, "change_data": {"company_uid": "d1627d1b-4ad8-4c2b-86ff-76d70b9b8cad", "brand_uid": "d76e55e9-5b31-48da-987d-d096b8a4793c", "store_uid": "4aac4b7a-e846-4a40-992a-1cab735c9a4f", "tran_id": "LPP5ZL12GVQ8DSKS9ZS75NWN", "tran_no": "", "origin_tran_id": "", "sale_detail": [], "sale_payment_method": [], "amount_origin": 0, "total_amount": 0, "extra_data": {"message_modify_table": "Using PIN code: Cập nhật thông tin"}}, "sale_current": {}};
const scope=Object.fromEntries(["company_uid","brand_uid","store_uid"].map(k=>[k,pin.change_data[k]]));
const branch={pos_parent:"BRAND-DQIR",pos_id:"109664"};
const clone=x=>JSON.parse(JSON.stringify(x));
function event(second,quantity,line,item="ITEM-RKIT",name="Drink") {
 const wall=Date.parse("2026-10-27T13:50:00Z")+second*1000,fmt=new Date(wall).toISOString().slice(0,19).replace("T"," ")+":000001";
 return {tran_id:pin.tran_id,log_type:"SALE_CHANGE",created_at:wall/1000,updated_at:wall/1000,start_date:wall-25200000,fmt_created_at:fmt,fmt_updated_at:fmt,
 change_data:{...scope,tran_id:pin.tran_id,tran_no:"280081",sale_detail:[{id_sale_detail:line,item_id:item,item_name:name,item_class_id:"DU",item_type_id:"TCDD",unit_id:"MON",price:48000,quantity,toppings:[]}]}};
}
const logs=()=>[event(0,1,"a","ITEM-7ZN9","Egg drink"),event(1,1,"b"),event(300,2,"c")];
const project=(rows,sales=[])=>projectC04OrdersV1({sales,logs:rows,scope,branch});
const sale=()=>({tran_id:pin.tran_id,tran_no:"280081",store_uid:scope.store_uid,tran_date:Date.parse("2026-10-27T14:00:00+07:00"),sale_detail:[{item_name:"Egg drink",price:48000,unit_id:"MON",quantity:1,toppings:[]},{item_name:"Drink",price:48000,unit_id:"MON",quantity:3,toppings:[]}]});
test("observed PIN audit alone creates no bill, cup or payment",()=>{
 assert.equal(isEmptyPinObservationV1(pin,scope),true);
 assert.equal(project([pin]).orders.length,0);
});
test("representative signed deltas preserve all four cups and hashes with PIN audit",()=>{
 const base=project(logs()),after=project([...logs(),pin]);
 assert.deepEqual(after,base);assert.equal(after.orders[0].cups.length,4);
 assert.equal(after.orders[0].payment_verification,"pending_verification");
});
test("PIN replay and arrival order do not change unit keys or quantities",()=>{
 assert.deepEqual(project([pin,...logs().reverse(),pin]),project(logs()));
});
test("C03 paid projection and C04 confirmation preserve payment parity",()=>{
 for(const fn of [projectC03PaidOrdersV1,projectC04OrdersV1]){
  const input={sales:[sale()],logs:logs(),scope,branch};
  const before=fn(input),after=fn({...input,logs:[pin,...logs(),pin]});
  assert.deepEqual(after,before);assert.equal(after.orders[0].cups.length,4);
 }
});
const mutations={
 item:r=>r.change_data.sale_detail.push({quantity:1}),
 payment:r=>r.change_data.sale_payment_method.push({amount:1}),
 amount:r=>r.change_data.total_amount=1,
 origin_amount:r=>r.change_data.amount_origin=1,
 transaction:r=>r.change_data.tran_id="foreign",
 store:r=>r.change_data.store_uid="foreign",
 company:r=>r.change_data.company_uid="foreign",
 brand:r=>r.change_data.brand_uid="foreign",
 snapshot:r=>r.sale_current={sale_detail:[{quantity:1}]},
 missing_snapshot:r=>delete r.sale_current,
 missing_details:r=>delete r.change_data.sale_detail,
 invalid_clock:r=>r.updated_at=0,
 missing_message:r=>r.change_data.extra_data={},
 invoice:r=>r.change_data.tran_no="unexpected",
 origin_transaction:r=>r.change_data.origin_tran_id="unexpected"
};
for(const [name,mutate] of Object.entries(mutations))test("PIN with "+name+" still holds both projection paths",()=>{
 const bad=clone(pin);mutate(bad);
 for(const fn of [projectC03PaidOrdersV1,projectC04OrdersV1])assert.throws(()=>fn({sales:[sale()],logs:[bad,...logs()],scope,branch}),/KDS_PAID_PIN_REVIEW_REQUIRED/);
});
test("other unknown types remain blocked",()=>{
 for(const fn of [projectC03PaidOrdersV1,projectC04OrdersV1])assert.throws(()=>fn({sales:[sale()],logs:[{...pin,log_type:"NEW_UNKNOWN"},...logs()],scope,branch}),/KDS_PAID_UNKNOWN_LOG_TYPE/);
});
