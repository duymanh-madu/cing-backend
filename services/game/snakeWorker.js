const { parentPort } = require('worker_threads');

const MAP_SIZE      = 4000;  // Vừa đủ để gặp nhau
const TICK_RATE     = 33;    // 30fps
const SNAKE_SPEED   = 4;
const BOOST_SPEED   = 8;
const SEGMENT_DIST  = 8;
const FOOD_COUNT    = 800;   // Nhiều thức ăn
const SPECIAL_COUNT = 20;
const MAX_PER_ROOM  = 30;
const FOOD_RADIUS   = 14;
const SPECIAL_RADIUS= 22;
const HIT_RADIUS    = 10;

const SPECIAL_ITEMS    = ['x2','x5','x10','magnet','shield'];
const SPECIAL_DURATION = { x2:15000, x5:15000, x10:15000, magnet:15000, shield:15000 };
const SPECIAL_GROW     = { x2:2, x5:3, x10:5, magnet:1, shield:1 };
const MAGNET_RADIUS    = 200; // Nam châm hút food trong bán kính này

const rooms = {};

// ── SPAWN ──────────────────────────────────────────
function rndFood(MAP) {
  return {
    id:    `f${Date.now()}${Math.random().toString(36).slice(2,5)}`,
    x:     Math.random()*MAP, y: Math.random()*MAP,
    value: Math.floor(Math.random()*4)+1,
    size:  5 + Math.random()*5,
    color: ['#C85010','#D06818','#B84008','#E07020','#F08030'][Math.floor(Math.random()*5)],
  };
}
function rndSpecial(MAP) {
  const type = SPECIAL_ITEMS[Math.floor(Math.random()*SPECIAL_ITEMS.length)];
  return { id:`s${Date.now()}${Math.random().toString(36).slice(2,5)}`, type,
    x:Math.random()*MAP, y:Math.random()*MAP };
}

function initRooms() {
  for (let i=1;i<=3;i++) {
    rooms[i] = { id:i, players:{}, food:[], specialItems:[], tick:0 };
    for (let j=0;j<FOOD_COUNT;j++) rooms[i].food.push(rndFood(MAP_SIZE));
    for (let j=0;j<SPECIAL_COUNT;j++) rooms[i].specialItems.push(rndSpecial(MAP_SIZE));
  }
}

function createPlayer(userId, name, avatar, roomId) {
  const cx = MAP_SIZE/2 + (Math.random()-0.5)*1000;
  const cy = MAP_SIZE/2 + (Math.random()-0.5)*1000;
  const angle = Math.random()*Math.PI*2;
  const segments = [];
  for (let i=0;i<12;i++) segments.push({
    x: cx - Math.cos(angle)*i*SEGMENT_DIST,
    y: cy - Math.sin(angle)*i*SEGMENT_DIST,
  });
  return {
    id:userId, name:name||'Cing iu', avatar:avatar||'', roomId,
    segments, angle, targetAngle:angle,
    kills:0, score:0, length:12, alive:true,
    boosting:false,
    effects:{},   // { x2: expireTime, magnet: expireTime, ... }
    multiplier:1, // x2/x5/x10
    viewport:700,
  };
}

// ── MESSAGES ────────────────────────────────────────
parentPort.on('message', (msg) => {
  switch(msg.type) {
    case 'JOIN': {
      const room = Object.values(rooms).find(r => Object.keys(r.players).length < MAX_PER_ROOM);
      if (!room) {
        parentPort.postMessage({ type:'ERROR', userId:msg.userId, message:'Tất cả phòng đang đầy!' });
        return;
      }
      const p = createPlayer(msg.userId, msg.name, msg.avatar, room.id);
      room.players[msg.userId] = p;
      parentPort.postMessage({ type:'JOINED', userId:msg.userId, roomId:room.id });
      break;
    }
    case 'LEAVE':
      for (const r of Object.values(rooms)) delete r.players[msg.userId];
      break;
    case 'DIRECTION':
      for (const r of Object.values(rooms)) {
        if (r.players[msg.userId]?.alive) r.players[msg.userId].targetAngle = msg.angle;
      }
      break;
    case 'BOOST':
      for (const r of Object.values(rooms)) {
        if (r.players[msg.userId]?.alive) r.players[msg.userId].boosting = msg.active;
      }
      break;
    case 'ROOMS':
      parentPort.postMessage({ type:'ROOMS_DATA', data: Object.values(rooms).map(r => ({
        id:r.id, players:Object.keys(r.players).length, max:MAX_PER_ROOM,
        full:Object.keys(r.players).length >= MAX_PER_ROOM,
      }))});
      break;
  }
});

// ── TICK ────────────────────────────────────────────
function tick() {
  const now = Date.now();
  for (const room of Object.values(rooms)) {
    const players = Object.values(room.players).filter(p=>p.alive);
    if (players.length===0) continue;
    room.tick++;

    // 1. MOVE
    players.forEach(p => {
      // Smooth turn
      let da = p.targetAngle - p.angle;
      while (da>Math.PI)  da -= Math.PI*2;
      while (da<-Math.PI) da += Math.PI*2;
      const turnRate = 0.12; // nhanh hơn để responsive hơn
      p.angle += Math.max(-turnRate, Math.min(turnRate, da));

      const spd = p.boosting ? BOOST_SPEED : SNAKE_SPEED;
      const nx = ((p.segments[0].x + Math.cos(p.angle)*spd) % MAP_SIZE + MAP_SIZE) % MAP_SIZE;
      const ny = ((p.segments[0].y + Math.sin(p.angle)*spd) % MAP_SIZE + MAP_SIZE) % MAP_SIZE;
      p.segments.unshift({ x:nx, y:ny });

      // Giữ độ dài đúng
      const maxLen = p.length * 4;
      if (p.segments.length > maxLen) p.segments = p.segments.slice(0, maxLen);

      // Viewport tăng theo độ dài
      p.viewport = Math.min(600 + p.length*6, 1200);
    });

    // 2. CLEAR EXPIRED EFFECTS + Update multiplier
    players.forEach(p => {
      Object.keys(p.effects).forEach(k => {
        if (p.effects[k] < now) delete p.effects[k];
      });
      // Cập nhật multiplier
      if (p.effects.x10) p.multiplier = 10;
      else if (p.effects.x5) p.multiplier = 5;
      else if (p.effects.x2) p.multiplier = 2;
      else p.multiplier = 1;
    });

    // 3. MAGNET - hút food về phía player
    players.forEach(p => {
      if (!p.effects.magnet) return;
      const head = p.segments[0];
      room.food.forEach(f => {
        const dx = head.x-f.x, dy = head.y-f.y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < MAGNET_RADIUS && dist > 1) {
          const force = 3 * (1 - dist/MAGNET_RADIUS);
          f.x += (dx/dist) * force;
          f.y += (dy/dist) * force;
          // Clamp
          f.x = Math.max(0, Math.min(MAP_SIZE, f.x));
          f.y = Math.max(0, Math.min(MAP_SIZE, f.y));
        }
      });
    });

    // 4. FOOD COLLISION
    players.forEach(p => {
      const head = p.segments[0];
      let ate = false;
      room.food = room.food.filter(f => {
        const dx=head.x-f.x, dy=head.y-f.y;
        if (dx*dx+dy*dy < FOOD_RADIUS*FOOD_RADIUS) {
          const grow = f.value * p.multiplier;
          p.length += grow;
          ate = true;
          room.food.push(rndFood(MAP_SIZE)); // respawn ngay
          return false;
        }
        return true;
      });
      if (ate) {
        parentPort.postMessage({ type:'ATE', userId:p.id, multiplier:p.multiplier });
      }
    });

    // 5. SPECIAL ITEM COLLISION
    players.forEach(p => {
      const head = p.segments[0];
      room.specialItems = room.specialItems.filter(s => {
        const dx=head.x-s.x, dy=head.y-s.y;
        if (dx*dx+dy*dy < SPECIAL_RADIUS*SPECIAL_RADIUS) {
          // Apply effect
          p.effects[s.type] = now + (SPECIAL_DURATION[s.type]||15000);
          p.length += SPECIAL_GROW[s.type]||1;
          // x2/x5/x10 cập nhật multiplier ngay
          if (s.type==='x2') p.multiplier = 2;
          if (s.type==='x5') p.multiplier = 5;
          if (s.type==='x10') p.multiplier = 10;
          parentPort.postMessage({ type:'ITEM_PICKUP', roomId:room.id, userId:p.id,
            itemType:s.type, duration:SPECIAL_DURATION[s.type]||15000 });
          room.specialItems.push(rndSpecial(MAP_SIZE)); // respawn
          return false;
        }
        return true;
      });
    });

    // 6. COLLISION DETECTION (head vs body)
    players.forEach(attacker => {
      if (!attacker.alive) return;
      const aHead = attacker.segments[0];
      players.forEach(target => {
        if (attacker.id===target.id || !target.alive) return;
        if (target.effects.shield) return;
        // Check head vs segments (skip đầu 5 để tránh false positive)
        for (let i=5; i<Math.min(target.segments.length, 200); i++) {
          const seg = target.segments[i];
          const dx = aHead.x-seg.x, dy = aHead.y-seg.y;
          const r = HIT_RADIUS + (target.length/30);
          if (dx*dx+dy*dy < r*r) {
            killPlayer(room, target, attacker, now);
            return;
          }
        }
      });
    });

    // 7. BROADCAST STATE
    players.forEach(p => {
      if (!p.alive) return;
      const head = p.segments[0];
      const vp = p.viewport;
      const vp2 = vp*vp;

      const nearbyPlayers = players
        .filter(o => {
          const dx=o.segments[0].x-head.x, dy=o.segments[0].y-head.y;
          return dx*dx+dy*dy < (vp*2)*(vp*2);
        })
        .map(o => ({
          id:o.id, name:o.name, kills:o.kills, length:o.length,
          effects:Object.keys(o.effects), multiplier:o.multiplier,
          segments: o.segments.filter(s => {
            const dx=s.x-head.x, dy=s.y-head.y;
            return Math.abs(dx)<vp*1.2 && Math.abs(dy)<vp*1.2;
          }).slice(0,100),
        }));

      const nearbyFood = room.food.filter(f => {
        const dx=f.x-head.x, dy=f.y-head.y;
        return Math.abs(dx)<vp*1.1 && Math.abs(dy)<vp*1.1;
      });
      const nearbySpecial = room.specialItems.filter(s => {
        const dx=s.x-head.x, dy=s.y-head.y;
        return Math.abs(dx)<vp*1.1 && Math.abs(dy)<vp*1.1;
      });

      parentPort.postMessage({
        type:'STATE', userId:p.id,
        state:{
          self:{ ...p, segments:p.segments.slice(0,100) },
          players:nearbyPlayers,
          food:nearbyFood,
          special:nearbySpecial,
          tick:room.tick,
          mapSize:MAP_SIZE,
        }
      });
    });

    // 8. LEADERBOARD mỗi 2s
    if (room.tick % 60 === 0) {
      const top = [...players].sort((a,b)=>b.kills-a.kills).slice(0,10)
        .map((p,i)=>({ rank:i+1, name:p.name, kills:p.kills, length:p.length }));
      parentPort.postMessage({ type:'LEADERBOARD', roomId:room.id, data:top });
    }
  }
}

function killPlayer(room, target, killer, now) {
  if (!target.alive) return;
  target.alive = false;
  killer.kills++;
  killer.score += 100;

  // Rải food từ xác — nhiều hơn nếu nạn nhân nhiều kill
  const foodCount = Math.min(target.length*3, 200);
  for (let i=0; i<foodCount; i++) {
    const seg = target.segments[Math.floor(Math.random()*Math.min(target.segments.length,50))];
    if (!seg) continue;
    room.food.push({
      id:`k${Date.now()}${i}`,
      x: Math.max(0, Math.min(MAP_SIZE, seg.x+(Math.random()-0.5)*40)),
      y: Math.max(0, Math.min(MAP_SIZE, seg.y+(Math.random()-0.5)*40)),
      value: 2 + Math.floor(target.kills/2),
      size: 7 + Math.random()*5,
      color: '#E8A030',
    });
  }

  parentPort.postMessage({ type:'KILL', roomId:room.id,
    killerId:killer.id, killerName:killer.name,
    targetId:target.id, targetName:target.name,
    targetLen:target.length, targetKills:target.kills });

  setTimeout(() => { delete room.players[target.id]; }, 3000);
}

initRooms();
setInterval(tick, TICK_RATE);
console.log('[WORKER] Snake game worker started');
