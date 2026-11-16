'use strict';
const {exact,fail}=require('./funding.cjs');
function createProductionSource({enabled=false,financeReader,quoteProjection,validateProjection}){
 return async request=>{
  if(enabled!==true)throw fail('FUNDING_DISABLED');
  if(!exact(request,['customerId','intent']))throw fail('FUNDING_INVALID');
  const before=await financeReader.read({customerId:request.customerId});
  const projection=validateProjection(await quoteProjection(request),request.intent);
  const after=await financeReader.read({customerId:request.customerId});
  if(JSON.stringify(before)!==JSON.stringify(after))throw fail('FUNDING_SELECTION_CHANGED');
  return {quote:{subtotal:projection.subtotal,shippingFee:projection.shipping.fee},snapshot:after};
 };
}
module.exports={createProductionSource};
