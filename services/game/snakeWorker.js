const { workerData, parentPort } = require('worker_threads');

const MAP_SIZE     = 3000;
const TICK_RATE    = 33;
const SNAKE_SPEED  = 5;
const BOOST_SPEED  = 10;
const SEGMENT_DIST = 12;
const FOOD_COUNT   = 500;
const SPECIAL_COUNT= 30;
const MAX_PER_ROOM = 30;
const SPECIAL_ITEMS= ['x2','x5','x10','magnet','shield'];
const SPECIAL_DURATION = { x2:15000, x5:15000, x10:15000, magnet:15000, shield:15000 };
const SPECIAL_GROW = { x2:3, x5:6, x10:12, magnet:2, shield:1 };

const rooms = {};

function initRooms() {
  for (let i = 1; i <= 3; i++) {
    rooms[i] = { id:i, players:{}, food:[], specialItems:[], tick:0 };
    spawnFood(rooms[i], FOOD_COUNT);
    spawnSpecialItems(rooms[i], SPECIAL_COUNT);
  }
}

function spawnFood(room, count) {
  for (let i = 0; i < count; i++) {
    room.food.push({
      id:    `f_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      x:     Math.random() * MAP_SIZE,
      y:     Math.random() * MAP_SIZE,
      value: Math.floor(Math.random()*3)+1,
      size:  4 + Math.random()*4,
      color: ['#C85010','#D06018','#B84008','#E07020'][Math.floor(Math.random()*4)],
    });
  }
}

function spawnSpecialItems(room, count) {
  for (let i = 0; i < count; i++) {
    const type = SPECIAL_ITEMS[Math.floor(Math.random()*SPECIAL_ITEMS.length)];
    room.specialItems.push({
      id:   `s_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      type, x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE,
    });
  }
}

function createPlayer(userId, name, avatar, roomId) {
  const cx = MAP_SIZE/2 + (Math.random()-0.5)*2000;
  const cy = MAP_SIZE/2 + (Math.random()-0.5)*2000;
  const angle = Math.random()*Math.PI*2;
  const segments = [];
  for (let i = 0; i < 12; i++) {
    segments.push({
      x: cx - Math.cos(angle)*i*SEGMENT_DIST,
      y: cy - Math.sin(angle)*i*SEGMENT_DIST,
    });
  }
  return { id:userId, name:name||'Cing iu', avatar:avatar||'', roomId,
    segments, angle, targetAngle:angle, speed:SNAKE_SPEED, boosting:false,
    kills:0, score:0, length:12, alive:true, effects:{}, viewport:800 };
}

// Handle messages from main thread
parentPort.on('message', (msg) => {
  switch(msg.type) {
    case 'JOIN':
      const room = Object.values(rooms).find(r => Object.keys(r.players).length < MAX_PER_ROOM);
      if (!room) { parentPort.postMessage({ type:'ERROR', userId:msg.userId, message:'Tất cả phòng đang đầy!' }); return; }
      room.players[msg.userId] = createPlayer(msg.userId, msg.name, msg.avatar, room.id);
      parentPort.postMessage({ type:'JOINED', userId:msg.userId, roomId:room.id, player:room.players[msg.userId] });
      break;
    case 'LEAVE':
      for (const r of Object.values(rooms)) { delete r.players[msg.userId]; }
      break;
    case 'DIRECTION':
      for (const r of Object.values(rooms)) {
        if (r.players[msg.userId]) { r.players[msg.userId].targetAngle = msg.angle; }
      }
      break;
    case 'BOOST':
      for (const r of Object.values(rooms)) {
        if (r.players[msg.userId]) { r.players[msg.userId].boosting = msg.active; }
      }
      break;
    case 'ROOMS':
      parentPort.postMessage({ type:'ROOMS', data: Object.values(rooms).map(r => ({
        id:r.id, players:Object.keys(r.players).length, max:MAX_PER_ROOM,
        full:Object.keys(r.players).length >= MAX_PER_ROOM,
      }))});
      break;
  }
});

function tick() {
  const now = Date.now();
  for (const room of Object.values(rooms)) {
    const players = Object.values(room.players).filter(p => p.alive);
    if (players.length === 0) continue;
    room.tick++;

    // Move
    players.forEach(p => {
      let da = p.targetAngle - p.angle;
      while (da > Math.PI) da -= Math.PI*2;
      while (da < -Math.PI) da += Math.PI*2;
      p.angle += Math.max(-0.08, Math.min(0.08, da));
      const spd = p.boosting ? BOOST_SPEED : SNAKE_SPEED;
      const head = {
        x: ((p.segments[0].x + Math.cos(p.angle)*spd) % MAP_SIZE + MAP_SIZE) % MAP_SIZE,
        y: ((p.segments[0].y + Math.sin(p.angle)*spd) % MAP_SIZE + MAP_SIZE) % MAP_SIZE,
      };
      p.segments.unshift(head);
      if (p.segments.length > p.length*3) p.segments = p.segments.slice(0, p.length*3);
      p.viewport = Math.min(600 + p.length*8, 1400);
    });

    // Food collision
    players.forEach(p => {
      const head = p.segments[0];
      room.food = room.food.filter(f => {
        const dx=head.x-f.x, dy=head.y-f.y;
        if (Math.sqrt(dx*dx+dy*dy) < 15) { p.length++; spawnFood(room,1); return false; }
        return true;
      });
      room.specialItems = room.specialItems.filter(s => {
        const dx=head.x-s.x, dy=head.y-s.y;
        if (Math.sqrt(dx*dx+dy*dy) < 20) {
          p.effects[s.type] = now + (SPECIAL_DURATION[s.type]||5000);
          p.length += SPECIAL_GROW[s.type]||1;
          parentPort.postMessage({ type:'ITEM_PICKUP', roomId:room.id, playerId:p.id, itemType:s.type });
          spawnSpecialItems(room,1);
          return false;
        }
        return true;
      });
      Object.keys(p.effects).forEach(k => { if(p.effects[k]<now) delete p.effects[k]; });
    });

    // Collision detection
    players.forEach(attacker => {
      if (!attacker.alive) return;
      const aHead = attacker.segments[0];
      players.forEach(target => {
        if (attacker.id===target.id||!target.alive) return;
        if (target.effects.shield) return;
        for (let i=3; i<target.segments.length; i++) {
          const seg=target.segments[i];
          const dx=aHead.x-seg.x, dy=aHead.y-seg.y;
          if (Math.sqrt(dx*dx+dy*dy) < 8+(target.length/20)) {
            target.alive = false;
            attacker.kills++; attacker.score+=100;
            // Rải food
            const foodDrop = Math.min(target.length*2, 150);
            for (let j=0; j<foodDrop; j++) {
              const seg2=target.segments[Math.floor(Math.random()*target.segments.length)];
              room.food.push({ id:`dead_${Date.now()}_${j}`, x:seg2.x+(Math.random()-0.5)*30,
                y:seg2.y+(Math.random()-0.5)*30, value:2, size:7, color:'#E8A030' });
            }
            parentPort.postMessage({ type:'KILL', roomId:room.id,
              killerId:attacker.id, killerName:attacker.name,
              targetId:target.id, targetName:target.name,
              targetLen:target.length, targetKills:target.kills });
            setTimeout(() => { delete room.players[target.id]; }, 3000);
            return;
          }
        }
      });
    });

    // Broadcast state mỗi tick
    players.forEach(p => {
      if (!p.alive) return;
      const head = p.segments[0];
      const vp = p.viewport;
      const nearbyPlayers = players.filter(o => {
        const dx=o.segments[0].x-head.x, dy=o.segments[0].y-head.y;
        return Math.sqrt(dx*dx+dy*dy) < vp*1.5;
      }).map(o => ({
        id:o.id, name:o.name, kills:o.kills, length:o.length,
        effects:Object.keys(o.effects),
        segments:o.segments.filter(s=>{
          const dx=s.x-head.x,dy=s.y-head.y;
          return Math.abs(dx)<vp&&Math.abs(dy)<vp;
        }).slice(0,80),
      }));
      const nearbyFood = room.food.filter(f=>{
        const dx=f.x-head.x,dy=f.y-head.y;
        return Math.abs(dx)<vp&&Math.abs(dy)<vp;
      });
      const nearbySpecial = room.specialItems.filter(s=>{
        const dx=s.x-head.x,dy=s.y-head.y;
        return Math.abs(dx)<vp&&Math.abs(dy)<vp;
      });
      parentPort.postMessage({ type:'STATE', userId:p.id,
        state:{ self:{...p,segments:p.segments.slice(0,80)},
          players:nearbyPlayers, food:nearbyFood, special:nearbySpecial, tick:room.tick }});
    });

    // Leaderboard mỗi 2 giây
    if (room.tick % 20 === 0) {
      const top = players.sort((a,b)=>b.kills-a.kills).slice(0,10)
        .map((p,i)=>({rank:i+1,name:p.name,kills:p.kills,length:p.length}));
      parentPort.postMessage({ type:'LEADERBOARD', roomId:room.id, data:top });
    }
  }
}

initRooms();
setInterval(tick, TICK_RATE);
console.log('[WORKER] Snake game worker started');
