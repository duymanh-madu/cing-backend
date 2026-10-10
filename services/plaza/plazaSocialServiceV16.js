"use strict";
const {createHash}=require('node:crypto');
const jpeg=require('jpeg-js');
const {normalizePhone}=require('../../utils/phoneIdentity');
const {createPlazaIdentityV9}=require('./plazaOwnedTitlesV16');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET='cing-plaza-avatars-v16';
function fail(code,statusCode=400){throw Object.assign(new Error(code),{code,statusCode});}
function checked(result){if(result.error){const message=result.error.message||'';const code=/^PLAZA_[A-Z_]+$/.test(message)?message:message.includes('CING_WALLET_INSUFFICIENT_BALANCE')?'PLAZA_INSUFFICIENT_WALLET':'PLAZA_SOCIAL_UNAVAILABLE';const transient=['PLAZA_SOCIAL_UNAVAILABLE','PLAZA_UNAVAILABLE','PLAZA_COMMERCE_UNAVAILABLE'].includes(code);fail(code,transient?503:400);}return result.data;}
function jpegSize(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length<12||buffer.length>262144||buffer.readUInt16BE(0)!==0xffd8||buffer.readUInt16BE(buffer.length-2)!==0xffd9)fail('PLAZA_INVALID_AVATAR');
 let i=2;
 while(i+4<buffer.length){if(buffer[i++]!==255)fail('PLAZA_INVALID_AVATAR');while(buffer[i]===255)i++;const marker=buffer[i++];if(marker===0xda||marker===0xd9)break;if(marker===0xd8||marker===1||marker>=0xd0&&marker<=0xd7)continue;const length=buffer.readUInt16BE(i);if(length<2||i+length>buffer.length)fail('PLAZA_INVALID_AVATAR');
  if([0xc0,0xc1,0xc2].includes(marker)){if(length<8)fail('PLAZA_INVALID_AVATAR');const height=buffer.readUInt16BE(i+3),width=buffer.readUInt16BE(i+5);if(width<1||height<1||width>1024||height>1024)fail('PLAZA_INVALID_AVATAR');return {width,height};}i+=length;
 }fail('PLAZA_INVALID_AVATAR');
}
function createPlazaSocialServiceV16({supabase,enabled=()=>process.env.CING_PLAZA_SOCIAL_ENABLED==='true',commerceEnabled=()=>process.env.CING_PLAZA_COMMERCE_ENABLED==='true'}){
 const titles=createPlazaIdentityV9({supabase});
 async function actor(customer){
  if(!enabled())fail('PLAZA_SOCIAL_UNAVAILABLE',503);
  const memberId=String(customer?.id||''),playerId=normalizePhone(customer?.phone);
  if(!UUID.test(memberId)||!/^0\d{9}$/.test(playerId))fail('PLAZA_UNAUTHORIZED',401);
  const gate=checked(await supabase.from('app_configs').select('customer_multiplayer_enabled').eq('id',1).maybeSingle());if(gate?.customer_multiplayer_enabled!==true)fail('PLAZA_UNAVAILABLE',503);
  const player=checked(await supabase.from('players').select('user_id,is_blocked,display_name,zalo_name,chat_locked_until').eq('user_id',playerId).maybeSingle());
  if(player?.is_blocked!==false)fail('PLAZA_MEMBER_BLOCKED',403);
  const character=checked(await supabase.from('cing_plaza_character_profiles_v7').select('character').eq('member_id',memberId).maybeSingle());if(!character)fail('PLAZA_CHARACTER_REQUIRED',403);
  return {memberId,playerId,displayName:player.display_name||player.zalo_name||customer.name||'Cing iu',character:character.character,chatLockedUntil:player.chat_locked_until};
 }
 async function profile(memberId){
  if(!UUID.test(memberId))fail('PLAZA_INVALID_MEMBER');
  const c=checked(await supabase.from('customers').select('id,name,phone').eq('id',memberId).maybeSingle());if(!c)fail('PLAZA_INVALID_MEMBER',404);
  const playerId=normalizePhone(c.phone);
  const p=checked(await supabase.from('players').select('display_name,zalo_name,is_blocked').eq('user_id',playerId).maybeSingle());if(p?.is_blocked!==false)fail('PLAZA_INVALID_MEMBER',404);
  const character=checked(await supabase.from('cing_plaza_character_profiles_v7').select('character').eq('member_id',memberId).maybeSingle());if(!character)fail('PLAZA_INVALID_MEMBER',404);
  const row=checked(await supabase.from('cing_plaza_social_profiles_v16').select('bio,avatar_key,revision,updated_at').eq('member_id',memberId).maybeSingle());
  const identity=await titles.read({memberId,playerId,displayName:p.display_name||p.zalo_name||c.name||'Cing iu'});
  let avatarUrl=null;if(row?.avatar_key){const result=await supabase.storage.from(BUCKET).createSignedUrl(row.avatar_key,600);avatarUrl=checked(result)?.signedUrl||null;}
  return {memberId,displayName:identity.displayName,character:character.character,bio:row?.bio||'',revision:row?.revision||1,avatarUrl,selectedBadge:identity.selectedBadge,ownedBadges:identity.ownedBadges};
 }
 async function overview(customer){
  const a=await actor(customer);
  const [own,coins,wallet,links,blocks]=await Promise.all([profile(a.memberId),supabase.from('cing_plaza_coin_accounts_v16').select('balance,loudspeakers').eq('member_id',a.memberId).maybeSingle(),supabase.from('cing_wallet_accounts').select('balance').eq('user_id',a.playerId).maybeSingle(),supabase.from('cing_plaza_friendships_v16').select('low_id,high_id,requester_id,status,created_at').or(`low_id.eq.${a.memberId},high_id.eq.${a.memberId}`).limit(200),supabase.from('cing_plaza_blocks_v16').select('blocked_id').eq('member_id',a.memberId).limit(200)]);
  const friendships=checked(links)||[],blocked=checked(blocks)||[];
  const ids=[...new Set([...friendships.map(r=>r.low_id===a.memberId?r.high_id:r.low_id),...blocked.map(r=>r.blocked_id)])];
  // Bounded list, read just the public profile fields needed by the friend UI.
  const customers=ids.length?checked(await supabase.from('customers').select('id,name,phone').in('id',ids)):[];
  const profiles=customers.length?checked(await supabase.from('players').select('user_id,display_name,zalo_name').in('user_id',customers.map(c=>normalizePhone(c.phone)))):[];
  const playerNames=new Map((profiles||[]).map(p=>[p.user_id,p.display_name||p.zalo_name]));
  const names=new Map(customers.map(r=>[r.id,playerNames.get(normalizePhone(r.phone))||r.name||'Cing iu']));
  return {profile:own,coinBalance:Number(checked(coins)?.balance||0),loudspeakers:Number(coins.data?.loudspeakers||0),walletBalance:Number(checked(wallet)?.balance||0),vndPerCoin:1000,loudspeakerPrice:3,commerceEnabled:commerceEnabled(),friends:friendships.map(r=>{const peerId=r.low_id===a.memberId?r.high_id:r.low_id;return {peerId,displayName:names.get(peerId)||'Cing iu',status:r.status,incoming:r.requester_id!==a.memberId};}),blocked:blocked.map(r=>({peerId:r.blocked_id,displayName:names.get(r.blocked_id)||'Cing iu'}))};
 }
 async function command(customer,input){
  const a=await actor(customer),op=input?.operation,id=input?.commandId;
  if(!UUID.test(id||''))fail('PLAZA_INVALID_REQUEST');
  const allowed=['convert','buy_loudspeaker','use_loudspeaker','pm','friend_request','friend_accept','friend_remove','block','unblock','profile'];
  if(!allowed.includes(op))fail('PLAZA_INVALID_OPERATION');
  if(['convert','buy_loudspeaker','use_loudspeaker'].includes(op)&&!commerceEnabled())fail('PLAZA_COMMERCE_UNAVAILABLE',503);
  let payload={};
  if(['convert','buy_loudspeaker'].includes(op)){if(!Number.isSafeInteger(input.quantity)||input.quantity<1||input.quantity>(op==='convert'?1000000:1000))fail('PLAZA_INVALID_QUANTITY');payload.quantity=input.quantity;}
  if(['friend_request','friend_accept','friend_remove','block','unblock','pm'].includes(op)){if(!UUID.test(input.peerId||'')||input.peerId===a.memberId)fail('PLAZA_INVALID_MEMBER');payload.peerId=input.peerId;}
  if(['pm','use_loudspeaker'].includes(op)){
   if(a.chatLockedUntil&&Date.parse(a.chatLockedUntil)>Date.now())fail('PLAZA_CHAT_LOCKED',403);
   if(typeof input.body!=='string'||!input.body.trim()||[...input.body.trim()].length>500||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.body))fail('PLAZA_INVALID_MESSAGE');
   payload.body=input.body.trim();
   // Do not put a changing title into idempotency payload: retries preserve the original receipt.
   const old=checked(await supabase.from('cing_plaza_commands_v16').select('operation,payload,receipt').eq('member_id',a.memberId).eq('command_id',id).maybeSingle());
   if(old){if(old.operation!==op||old.payload.body!==payload.body||old.payload.peerId!==payload.peerId)fail('PLAZA_COMMAND_CONFLICT');return old.receipt;}
   payload.verifiedBadge=(await titles.read(a)).selectedBadge;
  }
  if(op==='profile'){
   if(typeof input.bio!=='string'||[...input.bio].length>200||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)fail('PLAZA_INVALID_PROFILE');payload={bio:input.bio,expectedRevision:input.expectedRevision};
   if(input.avatarCommandId!==undefined){if(!UUID.test(input.avatarCommandId))fail('PLAZA_INVALID_AVATAR');const key=a.memberId+'/'+input.avatarCommandId+'.jpg';const result=await supabase.storage.from(BUCKET).download(key);checked(result);payload.avatarKey=key;}
  }
  return checked(await supabase.rpc('cing_plaza_social_command_v16',{p_member_id:a.memberId,p_operation:op,p_command_id:id,p_payload:payload}));
 }
 async function feed(customer){
  const a=await actor(customer);
  const [world,pm]=await Promise.all([supabase.from('cing_plaza_messages_v16').select('*').eq('channel','world').order('seq',{ascending:false}).limit(50),supabase.from('cing_plaza_messages_v16').select('*').eq('channel','pm').or(`author_id.eq.${a.memberId},recipient_id.eq.${a.memberId}`).order('seq',{ascending:false}).limit(100)]);
  const map=m=>({messageId:m.id,channel:m.channel,sequence:Number(m.seq),createdAt:Date.parse(m.created_at),body:m.body,peerId:m.author_id===a.memberId?m.recipient_id:m.author_id,author:{memberId:m.author_id,displayName:m.author_name,selectedBadge:m.author_badge}});
  return {world:(checked(world)||[]).reverse().map(map),pm:(checked(pm)||[]).reverse().map(map)};
 }
 async function upload(customer,id,buffer){
  const a=await actor(customer);if(!UUID.test(id||''))fail('PLAZA_INVALID_REQUEST');jpegSize(buffer);try{const decoded=jpeg.decode(buffer,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:2,maxMemoryUsageInMB:48});{
      let encoded=null;
      for(const quality of [82,70,58,46,34,25]){
        encoded=jpeg.encode({
          width:decoded.width,
          height:decoded.height,
          data:decoded.data
        },quality).data;
        if(encoded.length<=262144)break;
      }
      if(!encoded||encoded.length>262144)fail('PLAZA_INVALID_AVATAR');
      buffer=encoded;
    }}catch{fail('PLAZA_INVALID_AVATAR');}const key=a.memberId+'/'+id+'.jpg';
  const uploaded=await supabase.storage.from(BUCKET).upload(key,buffer,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'});
  if(uploaded.error){if(!['409','400'].includes(String(uploaded.error.statusCode)))fail('PLAZA_AVATAR_UPLOAD_FAILED',503);const existing=checked(await supabase.storage.from(BUCKET).download(key));const bytes=Buffer.from(await existing.arrayBuffer());if(!createHash('sha256').update(bytes).digest().equals(createHash('sha256').update(buffer).digest()))fail('PLAZA_COMMAND_CONFLICT');}
  return {avatarCommandId:id};
 }
 return {actor,overview,command,feed,upload,profile:async(customer,id)=>{await actor(customer);return profile(id);}};
}
module.exports={createPlazaSocialServiceV16,jpegSize};
