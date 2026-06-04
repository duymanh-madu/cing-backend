const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const supabase = require('../supabase');
const JWT_SECRET = process.env.JWT_SECRET || 'cing-admin-secret-2026';

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success:false });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ success:false }); }
}

// GET /admin/monitor/online - danh sách đang online
router.get('/online', requireAdmin, async (req, res) => {
  try {
    const onlineMap = global.onlineUsers || new Map();
    const onlineList = [...onlineMap.values()];
    
    // Lấy thêm info từ DB
    const ids = onlineList.map(u => u.userId);
    let players = [];
    if (ids.length > 0) {
      const { data } = await supabase.from('players')
        .select('user_id, zalo_name, avatar, crm_tier, total_points, crm_spend_alltime, last_seen_at')
        .in('user_id', ids);
      players = data || [];
    }
    const pMap = new Map((players).map(p => [p.user_id, p]));
    
    const enriched = onlineList.map(u => {
      const p = pMap.get(u.userId) || {};
      const connectedMs = Date.now() - new Date(u.connectedAt).getTime();
      const gameMs = u.gameStartedAt ? Date.now() - new Date(u.gameStartedAt).getTime() : 0;
      return {
        ...u,
        name:              p.zalo_name || u.name || u.userId,
        avatar:            p.avatar    || u.avatar || '',
        tier:              p.crm_tier  || 'member',
        points:            p.total_points || 0,
        spend:             p.crm_spend_alltime || 0,
        connectedDuration: Math.floor(connectedMs / 1000),
        currentPage:       u.currentPage || '',
        currentGame:       u.currentGame || '',
        gameDuration:      gameMs > 0 ? Math.floor(gameMs / 1000) : 0,
        lastActivity:      u.lastActivity || u.connectedAt,
      };
    }).sort((a,b) => new Date(b.connectedAt) - new Date(a.connectedAt));
    
    res.json({ success:true, data: enriched, count: enriched.length });
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

// GET /admin/monitor/recent-offline - offline gần đây
router.get('/recent-offline', requireAdmin, async (req, res) => {
  try {
    const onlineIds = [...(global.onlineUsers||new Map()).keys()];
    const { data } = await supabase.from('players')
      .select('user_id, zalo_name, avatar, crm_tier, total_points, last_seen_at, is_online')
      .eq('is_online', false)
      .not('last_seen_at', 'is', null)
      .order('last_seen_at', { ascending: false })
      .limit(100);
    
    const now = Date.now();
    const enriched = (data||[])
      .filter(p => !onlineIds.includes(p.user_id))
      .map(p => ({
        userId:   p.user_id,
        name:     p.zalo_name || p.user_id,
        avatar:   p.avatar || '',
        tier:     p.crm_tier || 'member',
        points:   p.total_points || 0,
        lastSeen: p.last_seen_at,
        offlineDuration: p.last_seen_at 
          ? Math.floor((now - new Date(p.last_seen_at).getTime()) / 1000)
          : null,
      }));
    
    res.json({ success:true, data: enriched, count: enriched.length });
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

// GET /admin/monitor/stats - thống kê tổng quan
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const onlineCount = (global.onlineUsers||new Map()).size;
    const { count: totalPlayers } = await supabase.from('players')
      .select('user_id', { count:'exact', head:true });
    const { count: onlineDb } = await supabase.from('players')
      .select('user_id', { count:'exact', head:true }).eq('is_online', true);
    
    const yesterday = new Date(Date.now() - 24*60*60*1000).toISOString();
    const { count: active24h } = await supabase.from('players')
      .select('user_id', { count:'exact', head:true })
      .or(`last_seen_at.gte.${yesterday},updated_at.gte.${yesterday}`);
    
    const week = new Date(Date.now() - 7*24*60*60*1000).toISOString();
    const { count: active7d } = await supabase.from('players')
      .select('user_id', { count:'exact', head:true })
      .or(`last_seen_at.gte.${week},updated_at.gte.${week}`);

    const month = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const { count: active30d } = await supabase.from('players')
      .select('user_id', { count:'exact', head:true })
      .or(`last_seen_at.gte.${month},updated_at.gte.${month}`);

    res.json({ success:true, data: {
      online_now:   onlineCount,
      total:        totalPlayers || 0,
      active_24h:   active24h   || 0,
      active_7d:    active7d    || 0,
      active_30d:   active30d   || 0,
      inactive:     (totalPlayers||0) - (active30d||0),
    }});
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

module.exports = router;

// Temp debug endpoint
router.get('/ipos-log/:phone', requireAdmin, async (req, res) => {
  try {
    const { getMembershipLog } = require('../services/foodbook');
    const result = await getMembershipLog(req.params.phone, {
      create_from: '2026-06-01 00:00:00',
      create_to: '2026-06-05 00:00:00',
      page_size: 50,
    });
    res.json({ total_spent: result.data?.total_spent, logs: result.data?.logs });
  } catch(e) { res.json({ error: e.message }); }
});
