const express  = require("express");
const multer   = require("multer");
const Jimp     = require("jimp");
const supabase = require("../supabase");
const router   = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
});

router.post("/avatar/:userId", upload.single("avatar"), async (req, res) => {
  try {
    const { userId } = req.params;
    if (!req.file) return res.status(400).json({ success: false, error: "Missing image" });

    const resized = req.file.buffer;

    const filePath = `avatars/${userId}-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, resized, { contentType: "image/jpeg", upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const avatarUrl = urlData.publicUrl;

    await supabase.from("players").update({ avatar: avatarUrl }).eq("user_id", userId);

    res.json({ success: true, avatar_url: avatarUrl });
  } catch (err) {
    console.error("Avatar upload error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/display-name/:userId", async (req, res) => {
  try {
    const { userId }       = req.params;
    const { display_name } = req.body;

    if (!display_name?.trim()) {
      return res.status(400).json({ success: false, error: "Missing display_name" });
    }

    const name = display_name.trim();

    const { error } = await supabase
      .from("players")
      .update({ zalo_name: name })
      .eq("user_id", userId);

    if (error) throw error;

    try {
      const axios = require("axios");
      await axios.post(
        "https://api.foodbook.vn/ipos/ws/xpartner/update_membership",
        null,
        {
          params: {
            access_token: process.env.IPOS_ACCESS_TOKEN,
            pos_parent:   process.env.IPOS_POS_PARENT,
            user_id:      userId,
            full_name:    name,
          },
        }
      );
    } catch (crmErr) {
      console.warn("iPos sync warning:", crmErr.message);
    }

    res.json({ success: true, display_name: name });
  } catch (err) {
    console.error("Display name error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/profile/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabase
      .from("players")
      .select("user_id, zalo_name, avatar, crm_tier, crm_spend_alltime, crm_orders_alltime")
      .eq("user_id", userId)
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
