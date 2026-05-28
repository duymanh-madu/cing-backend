const express  = require("express");
const router   = express.Router();
const jwt      = require("jsonwebtoken");
const supabase = require("../supabase");
const { sendZaloOAMessage, sendByUID, sendZBS } = require("../services/zaloMessageService");
const { sendZBSBroadcast } = require("../services/zaloZBSService");
const { sendNotification, broadcastNotification } = require("../services/notificationService");
const axios = require("axios");

const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";

async function sendZaloMessage(zalo_user_id, message) {
  try {
    const { data: config } = await supabase.from("app_configs")
      .select("zalo_oa_access_token").eq("id", 1).single();
    const token = config?.zalo_oa_access_token;
    if (!token) return false;
    await axios.post("https://openapi.zalo.me/v3.0/oa/message/cs", {
      recipient: { user_id: zalo_user_id },
      message:   { text: message },
    }, { headers: { access_token: token } });
    return true;
  } catch(e) {
    console.warn("[CDP] Zalo send failed:", e.message);
    return false;
  }
}

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ success: false, message: "Token không hợp lệ" }); }
}

/**
 * GET /admin/cdp/segments
 * Trả về danh sách segments và số lượng khách trong mỗi segment
 */
router.get("/segments", requireAdmin, async (req, res) => {
  try {
    const now     = new Date();
    const day7ago = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
    const day30ago= new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const day90ago= new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();

    const todayMD = `${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;

    const [allPlayers, vip, newInactive, longInactive, dormant, birthday, partner, loyalPartner] = await Promise.all([
      supabase.from("players").select("user_id", { count:"exact", head:true }),
      supabase.from("players").select("user_id", { count:"exact", head:true }).eq("crm_tier", "diamond"),
      supabase.from("players").select("user_id", { count:"exact", head:true }).eq("crm_spend_weekly", 0).gt("crm_orders_alltime", 0),
      supabase.from("players").select("user_id", { count:"exact", head:true }).eq("crm_spend_monthly", 0).gt("crm_orders_alltime", 0),
      supabase.from("players").select("user_id", { count:"exact", head:true }).eq("crm_spend_quarterly", 0).gt("crm_orders_alltime", 0),
      supabase.from("players").select("user_id", { count:"exact", head:true }).not("birthday", "is", null),
      supabase.from("players").select("user_id", { count:"exact", head:true }).eq("crm_tier", "partner"),
      supabase.from("players").select("user_id", { count:"exact", head:true }).eq("crm_tier", "loyal_partner"),
    ]);

    res.json({
      success: true,
      data: [
        { key:"all",          label:"Tất cả khách hàng",          icon:"👥", count: allPlayers.count || 0,  color:"#2196F3" },
        { key:"vip",          label:"Khách VIP (Kim Cương)",       icon:"💎", count: vip.count || 0,         color:"#9C27B0" },
        { key:"new_inactive", label:"Chưa mua trong tuần này",      icon:"⚠️", count: newInactive.count || 0, color:"#FF9800" },
        { key:"inactive_30",  label:"Chưa mua trong tháng này",     icon:"😴", count: longInactive.count || 0,color:"#f44336" },
        { key:"dormant_90",   label:"Chưa mua trong quý này",          icon:"❄️", count: dormant.count || 0,     color:"#607D8B" },
        { key:"inactive_custom", label:"Chưa quay lại (tùy chỉnh ngày)", icon:"📅", count: -1, color:"#FF5722" },
        { key:"birthday",     label:"Sinh nhật hôm nay",          icon:"🎂", count: 0,                      color:"#E91E63",
          note:"Tính năng cần thêm ngày sinh vào CRM" },
        { key:"partner",       label:"Đối tác",                     icon:"🤝", count: partner.count || 0,    color:"#7c3aed" },
        { key:"loyal_partner", label:"Đối tác thân thiết",           icon:"👑", count: loyalPartner.count || 0, color:"#581c87" },
        { key:"custom",        label:"Danh sách tuỳ chỉnh",          icon:"📋", count: 0,                      color:"#0891b2",
          note:"Nhập SĐT hoặc upload Excel" },
      ]
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /admin/cdp/segment-users/:segmentKey
 * Lấy danh sách user trong segment
 */
router.get("/segment-users/:segmentKey", requireAdmin, async (req, res) => {
  try {
    const { segmentKey } = req.params;
    const { limit = 20 } = req.query;
    const now      = new Date();
    const day7ago  = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
    const day30ago = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const day90ago = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase.from("players")
      .select("user_id, zalo_name, crm_tier, crm_spend_alltime, crm_orders_alltime, crm_synced_at")
      .limit(Number(limit));

    if (segmentKey === "vip")          query = query.eq("crm_tier", "diamond");
    if (segmentKey === "partner")      query = query.eq("crm_tier", "partner");
    if (segmentKey === "loyal_partner") query = query.eq("crm_tier", "loyal_partner");
    if (segmentKey === "new_inactive") query = query.lt("crm_synced_at", day7ago).gt("crm_orders_alltime", 0);
    if (segmentKey === "inactive_30")  query = query.lt("crm_synced_at", day30ago).gt("crm_orders_alltime", 0);
    if (segmentKey === "dormant_90")   query = query.lt("crm_synced_at", day90ago).gt("crm_orders_alltime", 0);
    if (segmentKey === "inactive_custom") {
      const days = parseInt(req.query.days) || 30;
      // Logic: dùng crm_spend columns để xác định chưa mua
      // 7 ngày = weekly=0, 30 ngày = monthly=0, 90 ngày = quarterly=0
      // Ngoài ra dùng last_order_at nếu có
      let inactiveQuery = supabase.from("players")
        .select("user_id, zalo_name, avatar, crm_spend_alltime, crm_orders_alltime, last_order_at, crm_synced_at", { count:"exact" })
        .gt("crm_orders_alltime", 0);

      if (days <= 7) {
        inactiveQuery = inactiveQuery.eq("crm_spend_weekly", 0);
      } else if (days <= 30) {
        inactiveQuery = inactiveQuery.eq("crm_spend_monthly", 0);
      } else if (days <= 90) {
        inactiveQuery = inactiveQuery.eq("crm_spend_quarterly", 0);
      } else if (days <= 365) {
        inactiveQuery = inactiveQuery.eq("crm_spend_yearly", 0);
      }

      const { data: inactive, count: inactiveCount } = await inactiveQuery
        .order("crm_spend_alltime", { ascending: false })
        .limit(Number(limit));

      return res.json({ success:true, data: inactive||[], count: inactiveCount||0 });
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /admin/cdp/send-notification
 * Gửi notification đến segment hoặc broadcast
 */
router.post("/send-notification", requireAdmin, async (req, res) => {
  try {
    const { segment_key, title, message, channels = ['socket'] } = req.body;
    // channels: ['socket', 'zalo_oa', 'uid', 'zbs']
    if (!title || !message) return res.status(400).json({ success: false, error: "Thiếu title hoặc message" });

    // Broadcast tất cả
    if (segment_key === "all") {
      await broadcastNotification({
        template_key: "CAMPAIGN_BROADCAST",
        custom: { title, message },
      });
      return res.json({ success: true, message: "Đã broadcast đến tất cả người dùng online", sent: "all" });
    }

    // Custom phones list
    if (segment_key === "custom") {
      const phones = req.body.custom_phones || [];
      if (phones.length === 0) return res.json({ success: true, message: "Không có SĐT nào", sent: 0 });
      let sent = 0;
      for (const phone of phones) {
        await sendNotification({
          user_id: phone, template_key: "CAMPAIGN_BROADCAST",
          custom: { title, message },
        });
        sent++;
      }
      return res.json({ success: true, message: `Đã gửi đến ${sent} khách hàng`, sent });
    }

    // Lấy users trong segment
    const now      = new Date();
    const day7ago  = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
    const day30ago = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const day90ago = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase.from("players").select("user_id").limit(500);
    if (segment_key === "vip")          query = query.eq("crm_tier", "diamond");
    if (segment_key === "new_inactive") query = query.eq("crm_spend_weekly", 0).gt("crm_orders_alltime", 0);
    if (segment_key === "inactive_30")  query = query.eq("crm_spend_monthly", 0).gt("crm_orders_alltime", 0);
    if (segment_key === "dormant_90")   query = query.eq("crm_spend_quarterly", 0).gt("crm_orders_alltime", 0);
    if (segment_key === "inactive_custom") {
      const days = parseInt(req.body.custom_days) || 30;
      query = query.gt("crm_orders_alltime", 0);
      if (days <= 7)        query = query.eq("crm_spend_weekly", 0);
      else if (days <= 30)  query = query.eq("crm_spend_monthly", 0);
      else if (days <= 90)  query = query.eq("crm_spend_quarterly", 0);
      else                  query = query.eq("crm_spend_yearly", 0);
    }

    const { data: users } = await query;
    if (!users || users.length === 0) return res.json({ success: true, message: "Không có user trong segment", sent: 0 });

    // Gửi lần lượt
    let sent = 0;
    for (const user of users) {
      await sendNotification({
        user_id: user.user_id,
        template_key: "CAMPAIGN_BROADCAST",
        custom: { title, message },
      });
      sent++;
    }

    res.json({ success: true, message: `Đã gửi đến ${sent} khách hàng`, sent });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// POST /admin/cdp/send-zbs - Zalo Broadcast Service
router.post("/send-zbs", requireAdmin, async (req, res) => {
  try {
    const { title, message, user_ids = [] } = req.body;
    if (!title || !message) return res.status(400).json({ success:false, error:"Thiếu title/message" });

    let follower_ids = [];
    if (user_ids.length > 0) {
      // Lấy zalo_user_id từ danh sách user_id
      const { data: players } = await supabase.from('players')
        .select('zalo_user_id').in('user_id', user_ids)
        .not('zalo_user_id', 'is', null);
      follower_ids = (players||[]).map(p => p.zalo_user_id).filter(Boolean);
    }

    res.json({ success:true, message:"ZBS đang gửi..." });
    const result = await sendZBS({ title, message, follower_ids });
    console.log('[ZBS] Done:', result);
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});


// GET /admin/cdp/zbs-templates - lấy danh sách ZBS templates đã config
router.get("/zbs-templates", requireAdmin, async (req, res) => {
  try {
    const { data } = await supabase.from('app_configs')
      .select('zbs_templates').eq('id', 1).single();
    res.json({ success:true, data: data?.zbs_templates || [] });
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

// PUT /admin/cdp/zbs-templates - lưu danh sách templates
router.put("/zbs-templates", requireAdmin, async (req, res) => {
  try {
    const { templates } = req.body;
    const { error } = await supabase.from('app_configs')
      .update({ zbs_templates: templates }).eq('id', 1);
    if (error) throw error;
    res.json({ success:true, message:'Đã lưu templates' });
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

// POST /admin/cdp/send-uid - gửi tin qua UID (Zalo OA CS message)
router.post("/send-uid", requireAdmin, async (req, res) => {
  try {
    const { segment_key, user_ids = [], title, message, custom_phones = [] } = req.body;
    if (!title || !message) return res.status(400).json({ success:false, error:'Thiếu title/message' });

    let targetUsers = user_ids;

    // Nếu không có user_ids, lấy từ segment
    if (!targetUsers.length && segment_key) {
      const { data: players } = await supabase.from('players')
        .select('user_id').not('zalo_user_id', 'is', null).limit(500);
      targetUsers = (players||[]).map(p => p.user_id);
    }
    if (custom_phones.length) targetUsers = [...targetUsers, ...custom_phones];

    res.json({ success:true, message:'Đang gửi UID...' });

    let sent=0, failed=0;
    for (const uid of targetUsers) {
      const { data: p } = await supabase.from('players')
        .select('zalo_user_id').eq('user_id', uid).single();
      if (!p?.zalo_user_id) { failed++; continue; }
      const r = await sendZaloOAMessage({ zalo_user_id: p.zalo_user_id, title, message });
      if (r.success) sent++; else failed++;
      await new Promise(r => setTimeout(r, 200));
    }
    console.log('[UID] Done: sent=' + sent + ' failed=' + failed);
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

// POST /admin/cdp/send-zbs-template - gửi ZBS với template
router.post("/send-zbs-template", requireAdmin, async (req, res) => {
  try {
    const { segment_key, user_ids = [], custom_phones = [],
            template_id, extra_vars = {} } = req.body;
    if (!template_id) return res.status(400).json({ success:false, error:'Thiếu template_id' });

    let targetIds = [...user_ids, ...custom_phones];

    // Lấy từ segment nếu không có user_ids
    if (!targetIds.length && segment_key) {
      let query = supabase.from('players').select('user_id').not('zalo_user_id','is',null).limit(2000);
      if (segment_key === 'vip')         query = query.eq('crm_tier','diamond');
      if (segment_key === 'partner')     query = query.eq('crm_tier','partner');
      if (segment_key === 'loyal_partner') query = query.eq('crm_tier','loyal_partner');
      if (segment_key === 'new_inactive') query = query.eq('crm_spend_weekly',0).gt('crm_orders_alltime',0);
      if (segment_key === 'inactive_30')  query = query.eq('crm_spend_monthly',0).gt('crm_orders_alltime',0);
      if (segment_key === 'dormant_90')   query = query.eq('crm_spend_quarterly',0).gt('crm_orders_alltime',0);
      const { data: players } = await query;
      targetIds = (players||[]).map(p => p.user_id);
    }

    if (!targetIds.length) return res.json({ success:true, message:'Không có user nào', sent:0 });

    res.json({ success:true, message:`Đang gửi ZBS đến ${targetIds.length} users...` });

    const result = await sendZBSBroadcast({ user_ids: targetIds, template_id, extra_vars });
    console.log('[ZBS Template] Done:', result);
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

module.exports = router;
