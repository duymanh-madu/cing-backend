const express  = require('express');
const router   = express.Router();
const supabase = require('../supabase');

// GET /game/snake/rooms - danh sách phòng
router.get('/rooms', (req, res) => {
  try {
    // Rooms managed by worker - return placeholder
    res.json({ success: true, data: [] });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /game/snake/leaderboard/weekly - top 100 tuần này
router.get('/leaderboard/weekly', async (req, res) => {
  try {
    const monday = getMonday();
    const { data } = await supabase
      .from('game_scores')
      .select('user_id, player_name, score, kills, max_length, played_at')
      .eq('game_key', 'tran-chau-dai-chien')
      .gte('played_at', monday)
      .order('score', { ascending: false })
      .limit(100);
    res.json({ success: true, data: data || [] });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /game/leaderboard/alltime - top 100 kỷ lục mọi thời đại TẤT CẢ game
router.get('/leaderboard/alltime', async (req, res) => {
  try {
    const GAMES = ['black-pearl-rush', 'tran-chau-dai-chien'];
    const results = await Promise.all(GAMES.map(async gameKey => {
      const { data } = await supabase
        .from('game_scores')
        .select('user_id, player_name, score, kills, game_key, played_at')
        .eq('game_key', gameKey)
        .order('score', { ascending: false })
        .limit(100);
      return { gameKey, records: data || [] };
    }));

    res.json({ success: true, data: results });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /game/leaderboard/alltime/:gameKey - top 100 kỷ lục 1 game
router.get('/leaderboard/alltime/:gameKey', async (req, res) => {
  try {
    const { gameKey } = req.params;
    const { data } = await supabase
      .from('game_scores')
      .select('user_id, player_name, score, kills, max_length, played_at')
      .eq('game_key', gameKey)
      .order('score', { ascending: false })
      .limit(100);
    res.json({ success: true, data: data || [] });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

function getMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff); d.setHours(0,0,0,0);
  return d.toISOString();
}

module.exports = router;
