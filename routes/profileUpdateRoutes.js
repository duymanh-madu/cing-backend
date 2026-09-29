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
const { normalizePhone } = require("../utils/phoneIdentity");
const authMiddleware = require("../middlewares/authMiddleware");

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
    const hasEmailField = Object.prototype.hasOwnProperty.call(req.body || {}, "email");
    const email = hasEmailField && req.body.email !== null && req.body.email !== undefined
      ? String(req.body.email).trim()
      : null;

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
        .eq("display_name", newName)
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

    if (!display_name?.trim() && !avatar_base64 && !hasEmailField) {
      return res.status(400).json({ success: false, error: "Không có thông tin nào để cập nhật" });
    }

    const { data: player } = await supabase
      .from("players")
      .select("profile_changed_at, total_points, display_name, zalo_name, avatar")
      .eq("user_id", userId)
      .single();

    const status = getCooldownStatus(player?.profile_changed_at, player?.total_points);

    // Cooldown chỉ áp dụng khi đổi tên hoặc avatar — email luôn được cập nhật tự do
    const isNameOrAvatarChange = !!(display_name?.trim() || avatar_base64);
    if (isNameOrAvatarChange && !status.can_change_free && !use_points) {
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
    if (email !== undefined) updates.email = email ? String(email || '').trim() : null;

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

    const newName = display_name?.trim() || player?.display_name || player?.zalo_name;
    if (display_name?.trim()) updates.display_name = newName;

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
          old_name: player?.display_name || player?.zalo_name || "",
          new_name: newName || "",
          old_avatar: player?.avatar || "",
          new_avatar: avatarUrl || "",
          avatar_changed: !!avatar_base64,
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
      email:          email !== undefined ? (String(email || '').trim() || null) : undefined,
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
      .select("user_id, display_name, zalo_name, avatar, crm_tier, crm_spend_alltime, crm_spend_weekly, crm_spend_monthly, crm_spend_quarterly, crm_spend_yearly, crm_spend_custom, crm_orders_alltime, total_points, member_activated, first_activated_at, profile_changed_at, is_blocked, chat_locked_until, charm_points, custom_badges, selected_badge, chat_charm_badge")
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
      if (c?.phone) phone = normalizePhone(c.phone);
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

// CING_NOTIFICATION_RECOVERY_AUTH_V1
// Authenticated legacy Notification Center compatibility.
// URL/body userId is a consistency check, never account authority.
function notificationOwner(req, requestedUserId) {
  const phone = normalizePhone(req.customer?.phone || "");
  const requested = normalizePhone(requestedUserId || "");

  if (
    !/^0[0-9]{9}$/.test(phone) ||
    !/^(?:0[0-9]{9}|84[0-9]{9})$/.test(
      String(requestedUserId || "")
    ) ||
    requested !== phone
  ) {
    return null;
  }

  return phone;
}

// GET /api/profile-update/notifications/:userId
router.get(
  "/notifications/:userId",
  authMiddleware,
  async (req, res) => {
    const phone = notificationOwner(
      req,
      req.params.userId
    );

    if (!phone) {
      return res.status(403).json({
        success: false,
        code: "NOTIFICATION_OWNER_REQUIRED",
      });
    }

    try {
      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, type, title, message, metadata, is_read, created_at"
        )
        .eq("user_id", phone)
        .eq("is_read", false)
        .neq("type", "gift_received")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      return res.json({
        success: true,
        data: data || [],
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        code: "NOTIFICATION_READ_FAILED",
      });
    }
  }
);

// POST /api/profile-update/notifications/mark-read
router.post(
  "/notifications/mark-read",
  authMiddleware,
  async (req, res) => {
    const phone = notificationOwner(
      req,
      req.body?.userId
    );

    if (!phone) {
      return res.status(403).json({
        success: false,
        code: "NOTIFICATION_OWNER_REQUIRED",
      });
    }

    const ids = req.body?.ids;

    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      ids.length > 20 ||
      ids.some(id => {
        const value = String(id);
        return !/^[1-9][0-9]{0,18}$/.test(value) ||
          BigInt(value) > 9223372036854775807n;
      })
    ) {
      return res.status(400).json({
        success: false,
        code: "NOTIFICATION_IDS_INVALID",
      });
    }

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", ids.map(String))
        .eq("user_id", phone)
        .neq("type", "gift_received");

      if (error) throw error;

      return res.json({
        success: true,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        code: "NOTIFICATION_MARK_READ_FAILED",
      });
    }
  }
);

// PATCH /profile/:userId/preferences — save user display badge preferences
router.patch("/profile/:userId/preferences", async (req, res) => {
  try {
    const userId = normalizePhone(req.params.userId);
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
    const phone = normalizePhone(userId);
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

// GET /profile-update/revive-credits-history/:userId
//
// Customer Revive Credit account statement.
//
// Authority:
// - authenticated customer identity
// - cing_revive_credit_balances for current balance
// - cing_revive_credit_transactions for durable ledger
//
// Legacy analytics_events are deliberately NOT used as
// financial/resource authority for this V2 surface.
//
router.get(
  "/revive-credits-history/:userId",
  authMiddleware,
  async (req, res) => {
    try {
      const { userId } = req.params;

      /*
       * Never let a URL parameter select another
       * customer's Revive Credit account.
       */
      const phone =
        normalizePhone(
          req.customer?.phone || ""
        );

      const requestedPhone =
        normalizePhone(userId);

      const customerZaloId =
        String(
          req.customer?.zalo_id || ""
        ).trim();

      if (
        !/^0[0-9]{9}$/.test(phone) ||
        !customerZaloId
      ) {
        return res.status(403).json({
          success: false,
          code:
            "REVIVE_HISTORY_IDENTITY_REQUIRED",
        });
      }

      if (
        !/^(?:0[0-9]{9}|84[0-9]{9})$/.test(
          String(userId)
        ) ||
        requestedPhone !== phone
      ) {
        return res.status(403).json({
          success: false,
          code:
            "REVIVE_HISTORY_FORBIDDEN",
        });
      }

      const {
        data: playerData,
        error: playerError,
      } =
        await supabase
          .from("players")
          .select(
            "user_id, zalo_user_id"
          )
          .eq("user_id", phone)
          .maybeSingle();

      if (playerError) {
        throw playerError;
      }

      const playerZaloId =
        String(
          playerData?.zalo_user_id || ""
        ).trim();

      if (
        !playerData ||
        normalizePhone(
          playerData.user_id || ""
        ) !== phone ||
        !playerZaloId ||
        playerZaloId !== customerZaloId
      ) {
        return res.status(403).json({
          success: false,
          code:
            "REVIVE_HISTORY_IDENTITY_MISMATCH",
        });
      }

      /*
       * Balance is read from the canonical balance
       * authority. A missing row means zero balance,
       * matching the existing Revive repository.
       */
      const {
        data: balanceRow,
        error: balanceError,
      } =
        await supabase
          .from(
            "cing_revive_credit_balances"
          )
          .select("balance")
          .eq("user_id", phone)
          .maybeSingle();

      if (balanceError) {
        throw balanceError;
      }

      const balance =
        Number(
          balanceRow?.balance ?? 0
        );

      if (
        !Number.isSafeInteger(balance) ||
        balance < 0
      ) {
        throw new Error(
          "REVIVE_HISTORY_BALANCE_INVALID"
        );
      }

      /*
       * Latest 100 rows are returned to the UI.
       * Totals are calculated across the complete
       * durable ledger with bounded PostgREST pages,
       * so total_earned / total_used never depend on
       * only the visible 100 rows.
       */
      const {
        data: recentRows,
        error: recentError,
      } =
        await supabase
          .from(
            "cing_revive_credit_transactions"
          )
          .select(
            [
              "id",
              "transaction_type",
              "amount",
              "balance_before",
              "balance_after",
              "reason",
              "game_key",
              "reference_type",
              "reference_id",
              "created_at",
            ].join(",")
          )
          .eq("user_id", phone)
          .order(
            "created_at",
            { ascending: false }
          )
          .order(
            "id",
            { ascending: false }
          )
          .limit(100);

      if (recentError) {
        throw recentError;
      }

      let totalEarned = 0;
      let totalUsed = 0;
      let offset = 0;

      const PAGE_SIZE = 1000;

      while (true) {
        const {
          data: amountRows,
          error: amountError,
        } =
          await supabase
            .from(
              "cing_revive_credit_transactions"
            )
            .select("amount")
            .eq("user_id", phone)
            .order(
              "id",
              { ascending: true }
            )
            .range(
              offset,
              offset + PAGE_SIZE - 1
            );

        if (amountError) {
          throw amountError;
        }

        const page =
          amountRows || [];

        for (const row of page) {
          const amount =
            Number(row.amount);

          if (
            !Number.isSafeInteger(amount) ||
            amount === 0
          ) {
            throw new Error(
              "REVIVE_HISTORY_AMOUNT_INVALID"
            );
          }

          if (amount > 0) {
            totalEarned += amount;
          } else {
            totalUsed +=
              Math.abs(amount);
          }

          if (
            !Number.isSafeInteger(
              totalEarned
            ) ||
            !Number.isSafeInteger(
              totalUsed
            )
          ) {
            throw new Error(
              "REVIVE_HISTORY_TOTAL_OVERFLOW"
            );
          }
        }

        if (page.length < PAGE_SIZE) {
          break;
        }

        offset += PAGE_SIZE;
      }

      const transactions =
        (recentRows || []).map(
          (row) => {
            const amount =
              Number(row.amount);

            const balanceBefore =
              Number(
                row.balance_before
              );

            const balanceAfter =
              Number(
                row.balance_after
              );

            if (
              !Number.isSafeInteger(amount) ||
              amount === 0 ||
              !Number.isSafeInteger(
                balanceBefore
              ) ||
              balanceBefore < 0 ||
              !Number.isSafeInteger(
                balanceAfter
              ) ||
              balanceAfter < 0 ||
              balanceAfter !==
                balanceBefore + amount
            ) {
              throw new Error(
                "REVIVE_HISTORY_LEDGER_INVALID"
              );
            }

            return {
              id:
                String(row.id),

              transaction_type:
                row.transaction_type,

              amount,

              balance_before:
                balanceBefore,

              balance_after:
                balanceAfter,

              reason:
                row.reason,

              game_key:
                row.game_key || null,

              reference_type:
                row.reference_type,

              reference_id:
                row.reference_id,

              created_at:
                row.created_at,
            };
          }
        );

      return res.json({
        success: true,

        data: {
          balance,

          total_earned:
            totalEarned,

          total_used:
            totalUsed,

          transactions,
        },
      });

    } catch (err) {
      console.error(
        "[PROFILE] Revive Credit history failed:",
        err.message
      );

      return res.status(500).json({
        success: false,
        code:
          "REVIVE_HISTORY_READ_FAILED",
      });
    }
  }
);

// GET /profile-update/points-history/:userId
router.get("/points-history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const phone = normalizePhone(userId);
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
