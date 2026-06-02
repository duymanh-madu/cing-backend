const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { getMember } = require("../services/foodbook");

/**
 * POST /api/activation/bootstrap
 * Called khi user login Zalo lần đầu
 * Body: { phone, zaloUserId, zaloName, zaloAvatar }
 */
router.post("/bootstrap", async (req, res) => {
  try {
    const { phone, zaloUserId, zaloName, zaloAvatar } = req.body || {};
    const cleanPhone = (phone || "").replace(/\D/g, "");

    // 1. Upsert player vao Supabase
    if (zaloUserId) {
      const playerData = {
        zalo_user_id: zaloUserId,
        zalo_name: zaloName || "Cing Customer",
        zalo_avatar: zaloAvatar || null,
        last_login_at: new Date().toISOString(),
      };
      if (cleanPhone) {
        playerData.phone_number = cleanPhone;
        playerData.phone = cleanPhone;
      }

      const { error: upsertError } = await supabase
        .from("players")
        .upsert(playerData, { onConflict: "zalo_user_id" });

      if (upsertError) console.error("Player upsert error:", upsertError.message);

      // Cập nhật zalo_user_id vào row theo phone (user_id)
      if (cleanPhone && zaloUserId) {
        await supabase.from("players")
          .update({ zalo_user_id: zaloUserId, zalo_name: zaloName||"Cing Customer", zalo_avatar: zaloAvatar||null })
          .eq("user_id", cleanPhone.replace(/^84/, "0"))
          .is("zalo_user_id", null);
      }
    }

    // 2. Get iPOS membership data neu co phone
    let memberData = null;
    if (cleanPhone) {
      const iposResult = await getMember(cleanPhone);
      if (iposResult.success && iposResult.data?.data) {
        const d = iposResult.data.data;
        memberData = {
          tierName: d.membership_type_name || "Hội viên",
          points: Math.floor(d.point || 0),
          paymentAmount: d.payment_amount || 0,
          eatTimes: d.eat_times || 0,
          name: d.name || zaloName || "Hội viên",
        };

        // Update player voi iPOS data
        if (zaloUserId) {
          await supabase.from("players").update({
            crm_tier: d.membership_type_name,
            total_spent_all_time: d.payment_amount || 0,
            total_orders: d.eat_times || 0,
            name: d.name || zaloName,
            member_activated: true,
          }).eq("zalo_user_id", zaloUserId);
        }
      }
    }

    return res.json({
      success: true,
      customer: {
        customerId: zaloUserId || cleanPhone || "guest",
        fullName: memberData?.name || zaloName || "Hội viên",
        phone: cleanPhone,
        memberTier: memberData?.tierName || "Hội viên",
        loyaltyPoints: memberData?.points || 0,
        paymentAmount: memberData?.paymentAmount || 0,
        eatTimes: memberData?.eatTimes || 0,
        activated: true,
        hasMembership: !!memberData,
      },
    });
  } catch (error) {
    console.error("Activation bootstrap error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Activation bootstrap failed",
      error: error.message,
    });
  }
});

module.exports = router;
