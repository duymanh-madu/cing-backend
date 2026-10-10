'use strict';
const KNOWN=new Set(['member','loyal','silver','gold','diamond','partner','loyal_partner','idol','ngoi_sao','minh_tinh','champion','hof_1','hof_2','hof_3']);
function fail(code){throw Object.assign(new Error(code),{code});}
function tier(value){const key=String(value||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/đ/g,'d').toLowerCase();if(key.includes('diamond')||key.includes('kim cuong'))return'diamond';if(key.includes('gold')||key.includes('vang'))return'gold';if(key.includes('silver')||key.includes('bac'))return'silver';const partner=key.includes('partner')||key.includes('doi tac'),loyal=key.includes('loyal')||key.includes('than thiet');return partner?(loyal?'loyal_partner':'partner'):loyal?'loyal':'member';}
function list(value){if(Array.isArray(value))return value;if(typeof value!=='string')return[];try{const x=JSON.parse(value);if(Array.isArray(x))return x;}catch{}return value.split(',').map(v=>v.trim());}
function owned(player,live={}){const result=[tier(player.crm_tier),...list(player.custom_badges).filter(k=>KNOWN.has(k))];if(live.champion===player.user_id)result.push('champion');const hof=live.hof?.get(player.user_id);if(hof)result.push(hof);return [...new Set(result)].filter(k=>KNOWN.has(k));}
function createPlazaIdentityV9({supabase,now=Date.now}){
 let cache=null,pending=null;
 async function live(){if(cache&&cache.until>now())return cache;if(pending)return pending;
  pending=(async()=>{const [spend,chess]=await Promise.all([supabase.from('players').select('user_id,crm_spend_alltime').gt('crm_spend_alltime',0).order('crm_spend_alltime',{ascending:false}).limit(3),supabase.from('chess_stats').select('user_id,wins,total_games').gt('wins',0).order('wins',{ascending:false}).order('total_games',{ascending:false}).limit(1)]);
   const value={until:now()+5000,hof:new Map(),champion:null};if(!spend.error)(spend.data||[]).forEach((p,i)=>value.hof.set(String(p.user_id).replace(/^84/,'0'),'hof_'+(i+1)));if(!chess.error)value.champion=String(chess.data?.[0]?.user_id||'').replace(/^84/,'0');cache=value;return value;
  })().finally(()=>pending=null);return pending;
 }
 async function read(actor){if(!actor?.memberId||!/^0\d{9}$/.test(actor.playerId||''))fail('PLAZA_UNAUTHORIZED');const {data:p,error}=await supabase.from('players').select('user_id,crm_tier,custom_badges,selected_badge').eq('user_id',actor.playerId).maybeSingle();if(error||!p||p.user_id!==actor.playerId)fail('PLAZA_IDENTITY_UNAVAILABLE');let liveState={};try{liveState=await live();}catch{}const badges=owned(p,liveState);return Object.freeze({memberId:actor.memberId,displayName:actor.displayName,ownedBadges:badges,selectedBadge:badges.includes(p.selected_badge)?p.selected_badge:badges[0]});}
 async function choose(actor,key){const identity=await read(actor);if(!identity.ownedBadges.includes(key))fail('PLAZA_BADGE_NOT_OWNED');const {data,error}=await supabase.from('players').update({selected_badge:key}).eq('user_id',actor.playerId).select('user_id').maybeSingle();if(error||data?.user_id!==actor.playerId)fail('PLAZA_BADGE_SAVE_FAILED');return {...identity,selectedBadge:key};}
 return {read,choose};
}
module.exports={createPlazaIdentityV9,ownedPlazaBadgesV9:owned};
