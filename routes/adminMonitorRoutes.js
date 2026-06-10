const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const supabase = require('../supabase');
const JWT_SECRET = process.env.JWT_SECRET || 'cing-admin-secret-2026';
const { normalizePhone } = require("../utils/phoneIdentity");

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
        .select('user_id, display_name, zalo_name, avatar, zalo_avatar, crm_tier, total_points, crm_spend_alltime, last_seen_at')
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
        name:              p.display_name || p.zalo_name || u.name || u.userId,
        avatar:            p.avatar || p.zalo_avatar || u.avatar || '',
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
      .select('user_id, display_name, zalo_name, avatar, zalo_avatar, crm_tier, total_points, last_seen_at, is_online')
      .eq('is_online', false)
      .not('last_seen_at', 'is', null)
      .order('last_seen_at', { ascending: false })
      .limit(100);
    
    const now = Date.now();
    const enriched = (data||[])
      .filter(p => !onlineIds.includes(p.user_id))
      .map(p => ({
        userId:   p.user_id,
        name:     p.display_name || p.zalo_name || p.user_id,
        avatar:   p.avatar || p.zalo_avatar || '',
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




// Test Railway public IP
router.get('/railway-ip', async (req, res) => {
  try {
    const https = require('https');
    const ip = await new Promise((resolve, reject) => {
      https.get('https://api.ipify.org?format=json', r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve(JSON.parse(d).ip));
      }).on('error', reject);
    });
    res.json({ success: true, railway_ip: ip });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// GET /api/admin/monitor/players-badges
router.get('/players-badges', requireAdmin, async (req, res) => {
  try {
    let all = [], from = 0, size = 1000;
    while (true) {
      const { data, error } = await supabase.from('players')
        .select('user_id, display_name, zalo_name, avatar, zalo_avatar, crm_tier, custom_badges, is_blocked, chat_locked_until')
        .order('zalo_name', { ascending: true })
        .range(from, from + size - 1);
      if (error) throw error;
      all = all.concat(data || []);
      if (!data || data.length < size) break;
      from += size;
    }
    res.json({ success: true, data: all });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/admin/monitor/update-player-badges
router.post('/update-player-badges', requireAdmin, async (req, res) => {
  try {
    const { user_id, custom_badges } = req.body;
    await supabase.from('players').update({ custom_badges }).eq('user_id', user_id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/admin/monitor/members-list
router.get('/members-list', requireAdmin, async (req, res) => {
  try {
    let query = supabase.from('players')
      .select(`
  user_id,
  display_name,
  zalo_name,
  avatar,
  zalo_avatar,
  crm_tier,
  is_blocked,
  chat_locked_until,
  member_activated,
  created_at,
  crm_spend_alltime,
  crm_spend_monthly,
  charm_points,
  total_points,
  game_plays
`)
      .order('crm_spend_alltime', { ascending: false })
      .limit(5000);
    if (req.query.activated_only === 'true') query = query.eq('member_activated', true);
    const { data, error } = await query;
    if (error) throw error;
    // Deduplicate by user_id
    const seen = new Set();
    const deduped = (data || []).filter(p => {
      if (seen.has(p.user_id)) return false;
      seen.add(p.user_id);
      return true;
    });
    const normalized = deduped.map(p => ({
  ...p,

  display_name:
    p.display_name ||
    p.zalo_name ||
    p.user_id,

  avatar:
    p.avatar ||
    p.zalo_avatar ||
    "",
}));
    res.json({ success: true, data: normalized });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/admin/monitor/member-action
router.post('/member-action', requireAdmin, async (req, res) => {
  try {
    const { user_id, action, duration } = req.body;
    const parseDuration = (d) => ({ '1d':86400000,'3d':259200000,'7d':604800000,'30d':2592000000,'forever':99*365*86400000 }[d]||604800000);
    let update = {};
    if (action === 'block') update = { is_blocked: true };
    else if (action === 'unblock') update = { is_blocked: false, chat_locked_until: null };
    else if (action === 'chat_lock') update = { chat_locked_until: new Date(Date.now() + parseDuration(duration)).toISOString() };
    await supabase.from('players').update(update).eq('user_id', user_id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/admin/monitor/add-member
router.post('/add-member', requireAdmin, async (req, res) => {
  try {
    const { phone, name } = req.body;
    const p = normalizePhone(phone);
    const { data: existing } = await supabase.from('players').select('user_id').eq('user_id', p).maybeSingle();
    if (existing) return res.status(400).json({ success: false, message: 'Thành viên đã tồn tại' });
    await supabase.from('players').insert({ user_id: p, zalo_name: name || p, game_plays: 0, total_points: 0 });
    res.json({ success: true, message: 'Đã thêm thành viên ' + p });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});
