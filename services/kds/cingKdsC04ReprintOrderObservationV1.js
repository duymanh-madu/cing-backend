'use strict';
const {interpretFabiC04ObservedClockV1}=require('./cingKdsFabiC04ObservedClockV1');
// RE_PRINT_ORDER is never a signed item delta, payment evidence or a cup command.
// Only the observed empty-change envelope is admitted as an inert observation.
function isReprintOrderObservationV1(raw,scope){
 if(raw?.log_type!=='RE_PRINT_ORDER')return false;
 const fail=()=>{throw Object.assign(new Error('KDS_PAID_REPRINT_ORDER_REVIEW_REQUIRED'),{code:'KDS_PAID_REPRINT_ORDER_REVIEW_REQUIRED'});};
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const change=raw.change_data,current=raw.sale_current;
 if(!object(change)||!object(current))fail();
 if(typeof raw.tran_id!=='string'||!raw.tran_id.trim()||raw.tran_id!==raw.tran_id.trim()||raw.tran_id.length>1000||change.tran_id!==raw.tran_id)fail();
 for(const key of ['company_uid','brand_uid','store_uid'])if(typeof scope?.[key]!=='string'||!scope[key]||change[key]!==scope[key])fail();
 if(!Array.isArray(change.sale_detail)||change.sale_detail.length!==0||!Array.isArray(change.sale_payment_method)||change.sale_payment_method.length!==0||change.origin_tran_id!==''||typeof change.tran_no!=='string'||!change.tran_no.trim()||change.tran_no!==change.tran_no.trim()||change.tran_no.length>1000)fail();
 for(const key of ['sale_detail','sale_payment_method'])if(!Array.isArray(current[key])||current[key].length>1000||current[key].some(x=>!object(x)))fail();
 interpretFabiC04ObservedClockV1(raw);
 return true;
}
module.exports={isReprintOrderObservationV1};
