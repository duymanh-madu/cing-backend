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
      .select("user_id, zalo_name, avatar, crm_tier, crm_spend_alltime, crm_orders_alltime, total_points, profile_changed_at, birthday")
      .eq("user_id", userId)
      .single();
    if (error) throw error;
    res.json({ success: true, data });
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

module.exports = router;
