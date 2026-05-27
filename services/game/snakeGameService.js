/**
 * TRÂN CHÂU ĐẠI CHIẾN - Game Service
 * Snake.io style multiplayer
 * 
 * Architecture:
 * - 3 rooms x 30 players max
 * - Server-side game loop 20fps
 * - Client-side interpolation 60fps
 * - Spatial partitioning for collision
 */

const ROOM_COUNT    = 3;
const MAX_PER_ROOM  = 30;
const TICK_RATE     = 50;       // ms, 20fps
const MAP_SIZE      = 8000;     // vô cực nhưng spawn trong vùng này
const FOOD_COUNT    = 200;      // số mồi thường trên map mỗi room
const SPECIAL_COUNT = 15;       // số vật phẩm đặc biệt
const SNAKE_SPEED   = 3.5;      // px/tick
const BOOST_SPEED   = 7;
const SEGMENT_DIST  = 12;       // khoảng cách giữa segments

const SPECIAL_ITEMS = ['x2','x5','x10','magnet','shield'];
const SPECIAL_DURATION = { x2:5000, x5:5000, x10:5000, magnet:8000, shield:6000 };
const SPECIAL_GROW   = { x2:3, x5:6, x10:12, magnet:2, shield:1 };
const SPECIAL_SCORE  = { x2:0, x5:0, x10:0, magnet:0, shield:0 };

// Rooms state
const rooms = {};

function initRooms() {
  for (let i = 1; i <= ROOM_COUNT; i++) {
    rooms[i] = {
      id: i,
      players: {},
      food: [],
      specialItems: [],
      tick: 0,
    };
    spawnFood(rooms[i], FOOD_COUNT);
    spawnSpecialItems(rooms[i], SPECIAL_COUNT);
  }
  console.log('[GAME] Rooms initialized');
}

// ============================================
// FOOD
// ============================================
function spawnFood(room, count) {
  for (let i = 0; i < count; i++) {
    room.food.push({
      id:     `f_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      x:      Math.random() * MAP_SIZE,
      y:      Math.random() * MAP_SIZE,
      value:  Math.floor(Math.random() * 3) + 1, // 1-3
      size:   4 + Math.random() * 4,
      color:  randomPearlColor(),
    });
  }
}

function spawnSpecialItems(room, count) {
  for (let i = 0; i < count; i++) {
    const type = SPECIAL_ITEMS[Math.floor(Math.random() * SPECIAL_ITEMS.length)];
    room.specialItems.push({
      id:   `s_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      type,
      x:    Math.random() * MAP_SIZE,
      y:    Math.random() * MAP_SIZE,
    });
  }
}

function randomPearlColor() {
  const colors = ['#C85010','#D06018','#B84008','#E07020','#A83008'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ============================================
// PLAYER
// ============================================
function createPlayer(userId, name, avatar, roomId) {
  const cx = MAP_SIZE/2 + (Math.random()-0.5)*2000;
  const cy = MAP_SIZE/2 + (Math.random()-0.5)*2000;
  const angle = Math.random() * Math.PI * 2;
  const segments = [];
  for (let i = 0; i < 12; i++) {
    segments.push({
      x: cx - Math.cos(angle) * i * SEGMENT_DIST,
      y: cy - Math.sin(angle) * i * SEGMENT_DIST,
    });
  }
  return {
    id:       userId,
    name:     name || 'Cing iu',
    avatar:   avatar || '',
    roomId,
    segments,
    angle,
    targetAngle: angle,
    speed:    SNAKE_SPEED,
    boosting: false,
    kills:    0,
    score:    0,        // kills * 100
    length:   12,
    alive:    true,
    effects:  {},       // { x2: expireTime, magnet: expireTime, shield: expireTime }
    viewport: 800,      // tăng theo length
    joinedAt: Date.now(),
  };
}

function addPlayer(userId, name, avatar) {
  // Tìm room có slot
  for (let i = 1; i <= ROOM_COUNT; i++) {
    const room = rooms[i];
    const count = Object.keys(room.players).length;
    if (count < MAX_PER_ROOM) {
      room.players[userId] = createPlayer(userId, name, avatar, i);
      console.log(`[GAME] Player ${name} joined room ${i} (${count+1}/${MAX_PER_ROOM})`);
      return { success: true, roomId: i, player: room.players[userId] };
    }
  }
  return { success: false, error: 'Tất cả phòng đang đầy! Vui lòng chờ...' };
}

function removePlayer(userId) {
  for (let i = 1; i <= ROOM_COUNT; i++) {
    if (rooms[i].players[userId]) {
      delete rooms[i].players[userId];
      console.log(`[GAME] Player ${userId} left room ${i}`);
      return i;
    }
  }
}

function setDirection(userId, angle) {
  for (let i = 1; i <= ROOM_COUNT; i++) {
    const p = rooms[i].players[userId];
    if (p && p.alive) {
      p.targetAngle = angle;
      return;
    }
  }
}

function setBoost(userId, boosting) {
  for (let i = 1; i <= ROOM_COUNT; i++) {
    const p = rooms[i].players[userId];
    if (p && p.alive) {
      p.boosting = boosting;
      return;
    }
  }
}

// ============================================
// GAME LOOP
// ============================================
async function tickRoom(room, io) {
  room.tick++;
  const now = Date.now();
  const players = Object.values(room.players).filter(p => p.alive);

  // 1. Move players
  players.forEach(p => {
    // Smooth turning
    let da = p.targetAngle - p.angle;
    while (da > Math.PI)  da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const turnSpeed = 0.08;
    p.angle += Math.max(-turnSpeed, Math.min(turnSpeed, da));

    const speed = p.boosting ? BOOST_SPEED : SNAKE_SPEED;
    const head = {
      x: p.segments[0].x + Math.cos(p.angle) * speed,
      y: p.segments[0].y + Math.sin(p.angle) * speed,
    };

    // Wrap around (map vô cực)
    head.x = ((head.x % MAP_SIZE) + MAP_SIZE) % MAP_SIZE;
    head.y = ((head.y % MAP_SIZE) + MAP_SIZE) % MAP_SIZE;

    p.segments.unshift(head);
    if (p.segments.length > p.length * 3) {
      p.segments = p.segments.slice(0, p.length * 3);
    }

    // Update viewport theo length
    p.viewport = Math.min(600 + p.length * 8, 1400);
  });

  // 2. Check food collision
  players.forEach(p => {
    const head = p.segments[0];
    room.food = room.food.filter(f => {
      const dx = head.x - f.x, dy = head.y - f.y;
      if (Math.sqrt(dx*dx+dy*dy) < 15) {
        p.length += 1;
        if (p.effects.x10) p.length += 9;
        else if (p.effects.x5) p.length += 4;
        else if (p.effects.x2) p.length += 1;
        // Spawn new food
        spawnFood(room, 1);
        return false;
      }
      return true;
    });

    // Special items
    room.specialItems = room.specialItems.filter(s => {
      const dx = head.x - s.x, dy = head.y - s.y;
      if (Math.sqrt(dx*dx+dy*dy) < 20) {
        // Apply effect
        const dur = SPECIAL_DURATION[s.type] || 5000;
        p.effects[s.type] = now + dur;
        p.length += SPECIAL_GROW[s.type] || 1;
        // Broadcast pickup
        io.to(`room_${room.id}`).emit('item:pickup', {
          playerId: p.id, itemType: s.type, duration: dur,
        });
        spawnSpecialItems(room, 1);
        return false;
      }
      return true;
    });

    // Clear expired effects
    Object.keys(p.effects).forEach(k => {
      if (p.effects[k] < now) delete p.effects[k];
    });
  });

  // 3. Collision detection (head vs body)
  players.forEach(attacker => {
    if (!attacker.alive) return;
    const aHead = attacker.segments[0];

    players.forEach(target => {
      if (attacker.id === target.id) return;
      if (!target.alive) return;

      // Check attacker head vs target body segments (skip first 3)
      for (let i = 3; i < target.segments.length; i++) {
        const seg = target.segments[i];
        const dx = aHead.x - seg.x, dy = aHead.y - seg.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const hitRadius = 8 + (target.length / 20);

        if (dist < hitRadius) {
          // Target has shield?
          if (target.effects.shield) return;

          // Kill target
          killPlayer(room, target, attacker, io);
          return;
        }
      }
    });
  });

  // 4. Broadcast state (only nearby players)
  players.forEach(p => {
    if (!p.alive) return;
    const head = p.segments[0];
    const vp = p.viewport;

    // Nearby players
    const nearbyPlayers = players
      .filter(other => {
        const dx = other.segments[0].x - head.x;
        const dy = other.segments[0].y - head.y;
        return Math.sqrt(dx*dx+dy*dy) < vp * 1.5;
      })
      .map(other => ({
        id:       other.id,
        name:     other.name,
        kills:    other.kills,
        length:   other.length,
        effects:  Object.keys(other.effects),
        // Chỉ gửi segments trong viewport
        segments: other.segments.filter(s => {
          const dx = s.x - head.x, dy = s.y - head.y;
          return Math.abs(dx) < vp && Math.abs(dy) < vp;
        }).slice(0, 80),
      }));

    // Nearby food
    const nearbyFood = room.food.filter(f => {
      const dx = f.x - head.x, dy = f.y - head.y;
      return Math.abs(dx) < vp && Math.abs(dy) < vp;
    });

    const nearbySpecial = room.specialItems.filter(s => {
      const dx = s.x - head.x, dy = s.y - head.y;
      return Math.abs(dx) < vp && Math.abs(dy) < vp;
    });

    io.to(p.id).emit('game:state', {
      self:    { ...p, segments: p.segments.slice(0, 80) },
      players: nearbyPlayers,
      food:    nearbyFood,
      special: nearbySpecial,
      tick:    room.tick,
    });
  });

  // 5. Leaderboard broadcast mỗi 2 giây
  if (room.tick % 40 === 0) {
    const top10 = players
      .sort((a,b) => b.kills - a.kills)
      .slice(0, 10)
      .map((p,i) => ({ rank:i+1, name:p.name, kills:p.kills, length:p.length }));
    io.to(`room_${room.id}`).emit('game:leaderboard', top10);
  }
}

async function killPlayer(room, target, killer, io) {
  if (!target.alive) return;
  target.alive = false;

  // Killer gets 100 points per kill
  killer.kills  += 1;
  killer.score  += 100;

  // Rải food từ xác target
  const foodCount = Math.min(target.length * 2, 150);
  for (let i = 0; i < foodCount; i++) {
    const seg = target.segments[Math.floor(Math.random() * target.segments.length)];
    room.food.push({
      id:    `dead_${Date.now()}_${i}`,
      x:     seg.x + (Math.random()-0.5)*30,
      y:     seg.y + (Math.random()-0.5)*30,
      value: 2 + Math.floor(target.kills / 3), // Nhiều kill = mồi ngon hơn
      size:  6 + Math.random()*6,
      color: '#E8A030',
      fromKill: true,
    });
  }

  // Notify
  io.to(`room_${room.id}`).emit('player:killed', {
    killerId:   killer.id,
    killerName: killer.name,
    targetId:   target.id,
    targetName: target.name,
    targetLen:  target.length,
  });

  io.to(target.id).emit('game:over', {
    kills:    target.kills,
    length:   target.length,
    rank:     Object.values(room.players).filter(p=>p.kills>target.kills).length + 1,
    killerName: killer.name,
  });

  // Lưu score vào DB sau 500ms
  setTimeout(async () => {
    try {
      const supabase = require('../../supabase');
      if (target.kills > 0) {
        await supabase.from('game_scores').upsert({
          user_id:     target.id,
          player_name: target.name,
          game_key:    'tran-chau-dai-chien',
          score:       target.kills * 100,
          kills:       target.kills,
          max_length:  target.length,
          played_at:   new Date().toISOString(),
        }, { onConflict: 'user_id,game_key' });
      }
    } catch(e) { console.warn('[GAME] Save score failed:', e.message); }
    // Remove after 3s (cho phép kill)
    setTimeout(() => delete room.players[target.id], 3000);
  }, 500);
}

function getRoomList() {
  return Object.values(rooms).map(r => ({
    id:      r.id,
    players: Object.keys(r.players).length,
    max:     MAX_PER_ROOM,
    full:    Object.keys(r.players).length >= MAX_PER_ROOM,
  }));
}

function startGameLoop(io) {
  initRooms();
  setInterval(async () => {
    for (const room of Object.values(rooms)) {
      await tickRoom(room, io);
      // Yield để event loop xử lý ping/pong
      await new Promise(r => setImmediate(r));
    }
  }, TICK_RATE);
  console.log(`[GAME] Loop started @ ${1000/TICK_RATE}fps`);
}

module.exports = { startGameLoop, addPlayer, removePlayer, setDirection, setBoost, getRoomList, rooms };
