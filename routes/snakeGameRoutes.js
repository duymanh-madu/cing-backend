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


// GET /game/leaderboard/alltime-games - public, chỉ game đang bật
router.get('/leaderboard/alltime-games', async (req, res) => {
  try {
    const { data: cfgRow } = await supabase.from("app_configs")
      .select("value").eq("key","alltime_games_config").single();
    const cfg = cfgRow?.value || { enabled:true, games:{
      "black-pearl-rush":{ enabled:true, display_name:"Bay cùng trân châu", icon:"🫧",
        rewards:[{rank:1,points:500,label:"🥇"},{rank:2,points:300,label:"🥈"},{rank:3,points:200,label:"🥉"}] },
      "tran-chau-dai-chien":{ enabled:true, display_name:"Trân Châu Đại Chiến", icon:"⚔️",
        rewards:[{rank:1,points:500,label:"🥇"},{rank:2,points:300,label:"🥈"},{rank:3,points:200,label:"🥉"}] }
    }};
    if (!cfg.enabled) return res.json({ success:true, data:[] });

    const enabledGames = Object.entries(cfg.games||{})
      .filter(([,v])=>v.enabled).map(([k,v])=>({key:k,...v}));

    const results = await Promise.all(enabledGames.map(async (game) => {
      const { data: scores } = await supabase
        .from("game_scores").select("user_id,player_name,avatar,score,kills")
        .eq("game_key", game.key).order("score",{ascending:false}).limit(2000);
      const bestMap = new Map();
      for (const s of (scores||[])) {
        const uid = String(s.user_id);
        if (!bestMap.has(uid)||s.score>bestMap.get(uid).score) bestMap.set(uid,s);
      }
      const userIds=[...bestMap.keys()].slice(0,200);
      const {data:players} = await supabase.from("players")
        .select("user_id,zalo_name,avatar").in("user_id",userIds);
      const pMap=new Map((players||[]).map(p=>[String(p.user_id),p]));
      const top100=[...bestMap.values()].sort((a,b)=>b.score-a.score).slice(0,100)
        .map((s,i)=>{
          const p=pMap.get(String(s.user_id));
          return {rank:i+1,user_id:s.user_id,
            player_name:p?.zalo_name||s.player_name||"Cing iu",
            avatar:p?.avatar||s.avatar||"",score:s.score,kills:s.kills||0};
        });
      return {game_key:game.key,display_name:game.display_name,
        icon:game.icon,rewards:game.rewards,data:top100};
    }));
    res.json({ success:true, data:results });
  } catch(err) {
    res.status(500).json({ success:false, error:err.message });
  }
});

module.exports = router;
