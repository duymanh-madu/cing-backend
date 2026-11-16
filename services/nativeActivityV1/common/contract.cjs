'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPERATIONS=Object.freeze({
 'hall.read':['period'], 'game.board':['gameKey'], 'game.policy':[], 'game.capability':[], 'revival.balance':[],
 'revival.state':['sessionId'], 'revival.start':['requestId','gameKey'], 'revival.recover':['requestId'],
 'revival.pending':['sessionId','requestId','expectedEventSeq','reason'],
 'revival.apply':['sessionId','requestId','expectedEventSeq','pendingEventId'],
 'revival.finalize':['sessionId','requestId','expectedEventSeq','finalScore','finalBestCombo'],
 'revival.abandon':['sessionId','requestId','expectedEventSeq'],
 'block.start':['requestId'], 'block.prepare':['sessionId','replay'], 'block.submit':['sessionId','replay'],
 'block.continue':['sessionId','requestId','replay'], 'block.progress':[]
});
const WRITES=new Set(['revival.start','revival.pending','revival.apply','revival.finalize','revival.abandon','block.start','block.prepare','block.submit','block.continue']);
const GAMES=new Set(['black-pearl-rush','cing-stack-tower','cing-block-puzzle']);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const fail=code=>Object.assign(Error(code),{code});
const {EXTRA,validateExtra}=require('./customer-services.cjs');
function validate(operation,input){
 if(EXTRA.has(operation))return validateExtra(operation,input);
 const rewardRequest=operation==='game.board'&&exact(input,['gameKey','includeRewards'])&&input.includeRewards===true;
 if(!Object.hasOwn(OPERATIONS,operation)||(!rewardRequest&&!exact(input,OPERATIONS[operation])))throw fail('ACTIVITY_INVALID');
 for(const [k,v]of Object.entries(input)){
  if(['requestId','sessionId'].includes(k)&&!(typeof v==='string'&&UUID.test(v)))throw fail('ACTIVITY_INVALID');
  if(k==='gameKey'&&(!GAMES.has(v)||(operation==='revival.start'&&v==='cing-block-puzzle')))throw fail('ACTIVITY_INVALID');
  if(k==='period'&&!['weekly','monthly','yearly','alltime','custom'].includes(v))throw fail('ACTIVITY_INVALID');
  if(['expectedEventSeq','finalScore','finalBestCombo'].includes(k)&&(!Number.isSafeInteger(v)||v<0||v>=2147483647))throw fail('ACTIVITY_INVALID');
  if(k==='pendingEventId'&&!(typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n))throw fail('ACTIVITY_INVALID');
  if(k==='reason'&&!['death','timeout'].includes(v))throw fail('ACTIVITY_INVALID');
  if(k==='replay'&&(!v||typeof v!=='object'||Array.isArray(v)||Buffer.byteLength(JSON.stringify(v))>2000000))throw fail('ACTIVITY_INVALID');
 }
 return structuredClone(input);
}
module.exports={UUID,OPERATIONS,WRITES,GAMES,exact,fail,validate};
