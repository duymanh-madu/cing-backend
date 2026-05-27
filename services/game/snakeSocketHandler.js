const { Worker } = require('worker_threads');
const path = require('path');
const supabase = require('../../supabase');

module.exports = function registerSnakeHandlers(io) {
  const gameNs = io.of('/snake');

  // Khởi động worker thread
  const worker = new Worker(path.join(__dirname, 'snakeWorker.js'));
  console.log('[SNAKE] Worker thread started');

  // Map socketId → userId
  const socketToUser = new Map();
  const userToSocket = new Map();

  // Nhận messages từ worker
  worker.on('message', (msg) => {
    switch(msg.type) {
      case 'JOINED':
        const sock = userToSocket.get(msg.userId);
        if (sock) {
          sock.join(`room_${msg.roomId}`);
          sock.emit('game:joined', { roomId:msg.roomId, playerId:msg.userId });
        }
        break;
      case 'STATE':
        const s = userToSocket.get(msg.userId);
        if (s) s.emit('game:state', msg.state);
        break;
      case 'KILL':
        gameNs.to(`room_${msg.roomId}`).emit('player:killed', {
          killerId:msg.killerId, killerName:msg.killerName,
          targetId:msg.targetId, targetName:msg.targetName,
        });
        const targetSock = userToSocket.get(msg.targetId);
        if (targetSock) targetSock.emit('game:over', {
          kills:msg.targetKills, length:msg.targetLen, killerName:msg.killerName,
        });
        // Lưu score
        if (msg.targetKills > 0) {
          supabase.from('game_scores').upsert({
            user_id:msg.targetId, player_name:msg.targetName,
            game_key:'tran-chau-dai-chien',
            score:msg.targetKills*100, kills:msg.targetKills,
            played_at:new Date().toISOString(),
          }, { onConflict:'user_id,game_key' }).catch(()=>{});
        }
        break;
      case 'ATE': {
        const aSock = userToSocket.get(msg.userId);
        if (aSock) aSock.emit('game:ate', { multiplier: msg.multiplier });
        break;
      }
      case 'ITEM_PICKUP':
        gameNs.to(`room_${msg.roomId}`).emit('item:pickup', {
          playerId:msg.playerId, itemType:msg.itemType,
        });
        break;
      case 'LEADERBOARD':
        gameNs.to(`room_${msg.roomId}`).emit('game:leaderboard', msg.data);
        break;
      case 'ROOMS_DATA':
        gameNs.emit('game:rooms', msg.data);
        break;
      case 'ERROR':
        const es = userToSocket.get(msg.userId);
        if (es) es.emit('game:error', { message:msg.message });
        break;
    }
  });

  worker.on('error', (err) => console.error('[SNAKE WORKER] Error:', err));
  worker.on('exit', (code) => {
    console.error('[SNAKE WORKER] Exited with code', code);
  });

  gameNs.on('connection', (socket) => {
    console.log('[SNAKE] Client connected:', socket.id);
    let currentUserId = null;

    socket.on('game:join', async ({ userId, name, avatar }) => {
      try {
        const { data: player } = await supabase
          .from('players').select('game_plays,zalo_name,avatar').eq('user_id',userId).single();
        if (!player || player.game_plays <= 0) {
          socket.emit('game:error', { message:'Bạn không còn lượt chơi!' }); return;
        }
        await supabase.from('players').update({ game_plays:player.game_plays-1 }).eq('user_id',userId);

        currentUserId = userId;
        socketToUser.set(socket.id, userId);
        userToSocket.set(userId, socket);

        worker.postMessage({ type:'JOIN', userId, name:name||player.zalo_name, avatar:avatar||player.avatar });
        console.log(`[SNAKE] ${name} joining...`);
      } catch(e) {
        console.error('[SNAKE] Join error:', e.message);
        socket.emit('game:error', { message:'Lỗi kết nối!' });
      }
    });

    socket.on('game:direction', ({ angle }) => {
      if (currentUserId) worker.postMessage({ type:'DIRECTION', userId:currentUserId, angle });
    });

    socket.on('game:boost', ({ active }) => {
      if (currentUserId) worker.postMessage({ type:'BOOST', userId:currentUserId, active });
    });

    socket.on('game:rooms', () => {
      worker.postMessage({ type:'ROOMS' });
    });

    socket.on('disconnect', () => {
      if (currentUserId) {
        worker.postMessage({ type:'LEAVE', userId:currentUserId });
        socketToUser.delete(socket.id);
        userToSocket.delete(currentUserId);
      }
      console.log('[SNAKE] Client disconnected:', socket.id);
    });
  });

  // Expose getRoomList cho REST API
  module.exports.getRoomList = () => {
    worker.postMessage({ type:'ROOMS' });
  };
};
