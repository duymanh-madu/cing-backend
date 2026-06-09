const express  = require("express");
const multer   = require("multer");
const supabase = require("../supabase");
const { deductPoints } = require("../services/loyaltyPointService");
const router   = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 2 * 1024 * 1024 },
});

const COOLDOWN_DAYS = 10;
const POINT_COST    = 10;

function getCooldownStatus(profileChangedAt, currentPoints) {
  const now       = new Date();
  const changedAt = profileChangedAt ? new Date(profileChangedAt) : null;
  const diffDays  = changedAt
    ? Math.floor((now - changedAt) / (1000 * 60 * 60 * 24))
    : 999;
  const canFree      = diffDays >= COOLDOWN_DAYS;
  const daysLeft     = canFree ? 0 : COOLDOWN_DAYS - diffDays;
  const nextFreeDate = changedAt
    ? new Date(changedAt.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
    : null;
  return {
    can_change_free: canFree,
    days_left:       daysLeft,
    next_free_date:  nextFreeDate?.toISOString() || null,
    can_use_points:  Number(currentPoints || 0) >= POINT_COST,
    current_points:  Number(currentPoints || 0),
    point_cost:      POINT_COST,
  };
}

router.get("/status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { data: player } = await supabase
      .from("players")
      .select("profile_changed_at, total_points")
      .eq("user_id", userId)
      .single();
    res.json({ success: true, data: getCooldownStatus(player?.profile_changed_at, player?.total_points) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/save/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { display_name, avatar_base64, use_points } = req.body;

    // Validate userId phải là số điện thoại VN hợp lệ
    if (!/^(0|84)\d{8,10}$/.test(String(userId))) {
      return res.status(400).json({ success:false, error:"userId không hợp lệ" });
    }

    // Check unique nickname nếu user muốn đổi tên
    if (display_name?.trim()) {
      const newName = display_name.trim();
      const { data: existing } = await supabase
        .from("players")
        .select("user_id")
        .eq("zalo_name", newName)
        .not("user_id", "eq", userId)
        .not("profile_changed_at", "is", null) // Chỉ check các user đã tự đổi tên
        .maybeSingle();
      if (existing) {
        return res.status(400).json({
          success: false,
          error: `Tên "${newName}" đã được sử dụng. Vui lòng chọn tên khác.`
        });
      }
    }

    if (!display_name?.trim() && !avatar_base64) {
      return res.status(400).json({ success: false, error: "Không có thông tin nào để cập nhật" });
    }

    const { data: player } = await supabase
      .from("players")
      .select("profile_changed_at, total_points, zalo_name, avatar")
      .eq("user_id", userId)
      .single();

    const status = getCooldownStatus(player?.profile_changed_at, player?.total_points);

    if (!status.can_change_free && !use_points) {
      return res.status(400).json({
        success:        false,
        error:          `Còn ${status.days_left} ngày nữa mới được đổi miễn phí`,
        days_left:      status.days_left,
        next_free_date: status.next_free_date,
        can_use_points: status.can_use_points,
        point_cost:     POINT_COST,
      });
    }

    if (use_points && !status.can_change_free) {
      if (!status.can_use_points) {
        return res.status(400).json({
          success: false,
          error:   `Không đủ điểm. Cần ${POINT_COST} điểm, bạn có ${status.current_points} điểm.`,
        });
      }
      await deductPoints({
        phone:   userId,
        user_id: userId,
        points:  POINT_COST,
        reason:  "Đổi thông tin hồ sơ",
      });
    }

    const updates = { profile_changed_at: new Date().toISOString() };

    let avatarUrl = player?.avatar || null;
    if (avatar_base64) {
      const buffer   = Buffer.from(avatar_base64, "base64");
      const filePath = `avatars/${userId}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, buffer, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      avatarUrl      = urlData.publicUrl;
      updates.avatar = avatarUrl;
    }

    const newName = display_name?.trim() || player?.zalo_name;
    if (display_name?.trim()) updates.zalo_name = newName;

    const { error } = await supabase.from("players").update(updates).eq("user_id", userId);
    if (error) throw error;

    if (display_name?.trim()) {
      try {
        const axios = require("axios");
        await axios.post("https://api.foodbook.vn/ipos/ws/xpartner/update_membership", null, {
          params: {
            access_token: process.env.IPOS_ACCESS_TOKEN,
            pos_parent:   process.env.IPOS_POS_PARENT,
            user_id:      userId,
            full_name:    newName,
          },
        });
      } catch (crmErr) {
        console.warn("iPos name sync warning:", crmErr.message);
      }
    }

    // Log analytics profile change
    try {
      await supabase.from('analytics_events').insert({
        event_name: 'profile_updated',
        user_id: String(userId),
        event_data: {
          field: display_name?.trim() ? (avatar_base64 ? 'name+avatar' : 'name') : 'avatar',
          points_used: (use_points && !status.can_change_free) ? POINT_COST : 0,
        },
        created_at: new Date().toISOString()
      });
    } catch(e) {}

    // Sync avatar mới vào game_scores
    try {
      const updateData = {};
      if (avatar_base64) updateData.avatar = avatarUrl;
      if (Object.keys(updateData).length > 0) {
        await supabase.from('game_scores').update(updateData).eq('user_id', userId);
      }
    } catch(e) { console.warn('game_scores sync warning:', e.message); }

    // Sync avatar mới vào customers table
    try {
      if (avatar_base64 && avatarUrl) {
        const { data: player } = await supabase.from('players')
          .select('zalo_user_id').eq('user_id', userId).maybeSingle();
        if (player?.zalo_user_id) {
          await supabase.from('customers')
            .update({ avatar: avatarUrl })
            .eq('zalo_id', player.zalo_user_id);
        }
      }
    } catch(e) { console.warn('customers sync warning:', e.message); }

    res.json({
      success:        true,
      display_name:   newName,
      avatar_url:     avatarUrl,
      points_used:    (use_points && !status.can_change_free) ? POINT_COST : 0,
      next_free_date: new Date(Date.now() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    console.error("Profile save error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/profile/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabase
      .from("players")
      .select("user_id, zalo_name, avatar, crm_tier, crm_spend_alltime, crm_spend_weekly, crm_spend_monthly, crm_spend_quarterly, crm_spend_yearly, crm_spend_custom, crm_orders_alltime, total_points, profile_changed_at, is_blocked, chat_locked_until, charm_points, custom_badges, selected_badge, chat_charm_badge")
      .eq("user_id", userId)
      .single();
    if (error) throw error;

    // Lấy birthday từ customers table
    let birthday = null;
    try {
      const { data: c } = await supabase
        .from("customers")
        .select("birthday")
        .eq("phone", userId)
        .maybeSingle();
      birthday = c?.birthday || null;
    } catch(e) {}

    res.json({ success: true, data: { ...data, birthday } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /profile-update/birthday
router.post("/birthday", async (req, res) => {
  try {
    const { user_id, birthday } = req.body;
    if (!user_id || !birthday) return res.status(400).json({ success: false, message: "Thiếu thông tin" });

    const supabase = require("../supabase");

    // Normalize user_id → phone nếu là UUID
    let phone = user_id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id);
    if (isUUID) {
      const { data: c } = await supabase.from("customers").select("phone").eq("id", user_id).maybeSingle();
      if (c?.phone) phone = c.phone.replace(/\D/g,"").replace(/^84/,"0");
    }

    // Update customers table
    await supabase.from("customers").update({ birthday }).eq("phone", phone);

    // Update players table
    await supabase.from("players").update({ birthday }).eq("user_id", phone);

    // Invalidate Redis cache để lần sau fetch data mới
    try {
      const redisClient = require("../services/infrastructure/cache/redisClient");
      await redisClient.del(`membership:${phone}`);
      await redisClient.del(`membership:84${phone.slice(1)}`);
    } catch(e) {}

    console.log(`[BIRTHDAY] Updated for ${phone}: ${birthday}`);
    res.json({ success: true, message: "Đã lưu ngày sinh" });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/profile-update/notifications/:userId — lấy notifications chưa đọc
router.get("/notifications/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const phone = userId.replace(/\D/g,"").replace(/^84/,"0");
    const { data } = await supabase.from("notifications")
      .select("id, type, title, message, metadata, is_read, created_at")
      .eq("user_id", phone)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(20);
    res.json({ success: true, data: data || [] });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/profile-update/notifications/mark-read
router.post("/notifications/mark-read", async (req, res) => {
  try {
    const { userId, ids } = req.body;
    const phone = userId.replace(/\D/g,"").replace(/^84/,"0");
    if (ids?.length) {
      await supabase.from("notifications").update({ is_read: true }).in("id", ids).eq("user_id", phone);
    } else {
      await supabase.from("notifications").update({ is_read: true }).eq("user_id", phone);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// PATCH /profile/:userId/preferences — save user display badge preferences
router.patch("/profile/:userId/preferences", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").replace(/\D/g, "").replace(/^84/, "0");
    if (!userId) return res.status(400).json({ success:false, message:"Missing userId" });

    const allowed = ["member","loyal","silver","gold","partner","diamond","loyal_partner","champion","hof_1","hof_2","hof_3","idol","ngoi_sao","minh_tinh", null];

    const payload = {};
    if ("selected_badge" in req.body && allowed.includes(req.body.selected_badge)) {
      payload.selected_badge = req.body.selected_badge;
    }
    if ("chat_charm_badge" in req.body && ["idol","ngoi_sao","minh_tinh",null].includes(req.body.chat_charm_badge)) {
      payload.chat_charm_badge = req.body.chat_charm_badge;
    }

    if (!Object.keys(payload).length) {
      return res.json({ success:true, data:{} });
    }

    const { data, error } = await supabase
      .from("players")
      .update(payload)
      .eq("user_id", userId)
      .select("user_id, selected_badge, chat_charm_badge")
      .maybeSingle();

    if (error) throw error;
    res.json({ success:true, data });
  } catch (err) {
    res.status(500).json({ success:false, error:err.message });
  }
});


module.exports = router;

// GET /profile-update/plays-history/:userId
router.get("/plays-history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const phone = userId.replace(/\D/g,"").replace(/^84/,"0");
    const { data: playerData } = await supabase
      .from("players").select("user_id, zalo_user_id")
      .eq("user_id", phone).maybeSingle();
    const ids = [...new Set([userId, phone, playerData?.zalo_user_id].filter(Boolean))];
    const { data, error } = await supabase
      .from("analytics_events")
      .select("event_name, event_data, created_at")
      .in("user_id", ids)
      .in("event_name", ["plays_added", "plays_deducted"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const seen = new Set();
    const deduped = (data || []).filter(item => {
      const key = item.created_at + '_' + item.event_name + '_' + (item.event_data?.amount || 0);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json({ success: true, data: deduped });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /profile-update/points-history/:userId
router.get("/points-history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const phone = userId.replace(/\D/g,"").replace(/^84/,"0");
    const { data: playerData } = await supabase
      .from("players").select("user_id, zalo_user_id")
      .eq("user_id", phone).maybeSingle();
    const ids = [...new Set([userId, phone, playerData?.zalo_user_id].filter(Boolean))];

    const { data, error } = await supabase
      .from("analytics_events")
      .select("event_name, event_data, created_at")
      .in("user_id", ids)
      .in("event_name", ["points_added", "points_deducted", "plays_added", "plays_deducted"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    // Dedup
    const seen = new Set();
    const deduped = (data || []).filter(item => {
      const key = item.created_at + '_' + item.event_name + '_' + (item.event_data?.amount || 0);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json({ success: true, data: deduped });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
