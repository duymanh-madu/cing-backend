const { addPlayer, removePlayer, setDirection, setBoost, getRoomList } = require('./snakeGameService');
const supabase = require('../../supabase');

module.exports = function registerSnakeHandlers(io) {
  const gameNs = io.of('/snake');
  // Override ping settings for game namespace
  gameNs.use((socket, next) => {
    socket.conn.setTimeout = () => {}; // disable timeout
    next();
  });

  gameNs.on('connection', (socket) => {
    console.log('[SNAKE] Client connected:', socket.id);
    let currentUserId = null;
    let currentRoomId = null;

    // Join game
    socket.on('game:join', async ({ userId, name, avatar }) => {
      try {
        // Kiểm tra lượt chơi
        const { data: player } = await supabase
          .from('players').select('game_plays, zalo_name, avatar').eq('user_id', userId).single();

        if (!player || player.game_plays <= 0) {
          socket.emit('game:error', { message: 'Bạn không còn lượt chơi! Hãy đặt hàng để nhận thêm lượt.' });
          return;
        }

        // Trừ 1 lượt chơi
        await supabase.from('players')
          .update({ game_plays: player.game_plays - 1 })
          .eq('user_id', userId);

        // Join room
        const result = addPlayer(userId, name || player.zalo_name, avatar || player.avatar);
        if (!result.success) {
          socket.emit('game:error', { message: result.error });
          return;
        }

        currentUserId = userId;
        currentRoomId = result.roomId;

        // Join socket room
        socket.join(`room_${result.roomId}`);
        socket.join(userId); // personal room for state updates

        socket.emit('game:joined', {
          roomId:    result.roomId,
          playerId:  userId,
          rooms:     getRoomList(),
        });

        // Notify others
        gameNs.to(`room_${result.roomId}`).emit('room:player_joined', {
          name: name || player.zalo_name,
          count: getRoomList().find(r=>r.id===result.roomId)?.players,
        });

        console.log(`[SNAKE] ${name} joined room ${result.roomId}`);

        // Emit test state ngay để check canvas
        const testPlayer = result.player;
        setInterval(() => {
          if (!testPlayer) return;
          testPlayer.segments[0].x += 2;
          socket.emit('game:state', {
            self: testPlayer,
            players: [],
            food: Array.from({length:20}, (_,i) => ({
              id: 'f'+i, x: 3000+i*100, y: 3000+i*80, size:8, color:'#C85010'
            })),
            special: [],
            tick: Date.now(),
          });
        }, 100);
      } catch(e) {
        console.error('[SNAKE] Join error:', e.message);
        socket.emit('game:error', { message: 'Lỗi kết nối, thử lại!' });
      }
    });

    // Direction input
    socket.on('game:direction', ({ angle }) => {
      if (currentUserId) setDirection(currentUserId, angle);
    });

    // Boost
    socket.on('game:boost', ({ active }) => {
      if (currentUserId) setBoost(currentUserId, active);
    });

    // Get room list
    socket.on('game:rooms', () => {
      socket.emit('game:rooms', getRoomList());
    });

    // Disconnect
    socket.on('disconnect', () => {
      if (currentUserId) {
        removePlayer(currentUserId);
        if (currentRoomId) {
          gameNs.to(`room_${currentRoomId}`).emit('room:player_left', { playerId: currentUserId });
        }
      }
      console.log('[SNAKE] Client disconnected:', socket.id);
    });
  });

  console.log('[SNAKE] Socket handlers registered on /snake namespace');
};
