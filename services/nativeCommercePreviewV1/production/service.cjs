'use strict';
const {exact}=require('../common/quote.cjs');
const fail=code=>Object.assign(Error(code),{code});
function createPrivateService({enabled=false,ownerReader,projection,google,fundingSource,fundingEnabled=false}){return {async read(b){
 if(!enabled)throw fail('QUOTE_DISABLED');
 const {UUID,searchInput,validSuggestions}=await import('../common/wire.mjs');
 if(!exact(b,['requestId','customerId','operation','input'])||!UUID.test(b.requestId)||!UUID.test(b.customerId)||!['quote','search','funding'].includes(b.operation))throw fail('QUOTE_INVALID');
 if(b.operation==='funding'){if(!fundingEnabled)throw fail('FUNDING_DISABLED');if(!exact(b.input,['intent','selection']))throw fail('FUNDING_INVALID');require('../common/funding.cjs').validateSelection(b.input.selection);require('../common/quote.cjs').validateIntent(b.input.intent);}
 if(b.operation==='search'&&!searchInput(b.input))throw fail('QUOTE_INVALID');
 if(b.operation==='quote')require('../common/quote.cjs').validateIntent(b.input);
 try{const before=(await ownerReader.readInternal({customerId:b.customerId})).identity;let payload;
 if(b.operation==='funding'){payload=await fundingSource({customerId:b.customerId,intent:b.input.intent});}else if(b.operation==='search'){payload=await google.search(b.input);if(!validSuggestions(payload))throw fail('QUOTE_UNAVAILABLE');}else payload=await projection({customerId:b.customerId,intent:b.input});
 const after=(await ownerReader.readInternal({customerId:b.customerId})).identity;if(['customerId','phone','zaloId'].some(k=>before[k]!==after[k]))throw fail('ACCOUNT_IDENTITY_CONFLICT');
 return {requestId:b.requestId,customerId:b.customerId,operation:b.operation,payload};
 }catch(e){throw fail(['FUNDING_INVALID','FUNDING_SELECTION_CHANGED','ACCOUNT_BLOCKED','ACCOUNT_IDENTITY_CONFLICT','QUOTE_INVALID','QUOTE_ITEM_UNAVAILABLE','QUOTE_SELECTION_CHANGED','TRY_LATER'].includes(e?.code)?e.code:'QUOTE_UNAVAILABLE');}
 }};}
module.exports={createPrivateService};
