const express = require("express");
const axios = require("axios");
const cors = require("cors");
const supabase = require("./supabase");

const app = express();

/**
 * MIDDLEWARE
 */

app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json());

/**
 * PORT
 */

const PORT = process.env.PORT || 5050;

/**
 * ROOT
 */

app.get("/", (req, res) => {
  res.send("Backend OK");
});

/**
 * MEMBER LEVEL ENGINE
 */

function getMemberLevel(totalSpent) {
  if (totalSpent >= 10000000) {
    return "Kim Cương";
  }

  if (totalSpent >= 5000000) {
    return "Vàng";
  }

  if (totalSpent >= 3000000) {
    return "Bạc";
  }

  if (totalSpent >= 1000000) {
    return "Thân Thiết";
  }

  return "Mới";
}

/**
 * MENU API
 */

app.get("/api/menu", async (req, res) => {
  try {
    const response = await axios.get(
      "https://api.foodbook.vn/ipos/ws/xpartner/v2/items",
      {
        params: {
          access_token:
            "4ETARZYY813AS5LEKOOCD1NP61Y6J55C",

          pos_parent:
            "APP_CINGHUTANG",

          pos_id:
            "10000343",
        },

        timeout: 10000,
      }
    );

    res.json(response.data);
  } catch (error) {
    console.log("MENU API ERROR:");
    console.log(error.message);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * MEMBER API
 */

app.get("/api/member/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const response = await axios.get(
      "https://api.foodbook.vn/ipos/ws/xpartner/membership_detail",
      {
        params: {
          access_token:
            "4ETARZYY813AS5LEKOOCD1NP61Y6J55C",

          pos_parent:
            "APP_CINGHUTANG",

          user_id: userId,
        },

        timeout: 10000,
      }
    );

    res.json(response.data);
  } catch (error) {
    console.log("MEMBER API ERROR:");
    console.log(error.message);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * USER VOUCHERS FROM IPOS
 */

app.get("/api/vouchers/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const response = await axios.get(
      "https://api.foodbook.vn/ipos/ws/xpartner/member_vouchers",
      {
        params: {
          access_token:
            "4ETARZYY813AS5LEKOOCD1NP61Y6J55C",

          pos_parent: "FOODBOOK",

          user_id: userId,
        },

        timeout: 10000,
      }
    );

    res.json(response.data);
  } catch (error) {
    console.log("VOUCHER API ERROR:");
    console.log(error.message);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * ORDER WEBHOOK
 */

app.post("/api/order-webhook", async (req, res) => {
  try {
    const {
      user_id,
      customer_name,
      total_amount,
    } = req.body;

    /**
     * VALIDATE
     */

    if (!user_id || !total_amount) {
      return res.status(400).json({
        success: false,
        message: "Thiếu dữ liệu",
      });
    }

    /**
     * REWARD
     */

    const spins = Math.floor(total_amount / 50000);

    const coins = Math.floor(total_amount / 1000);

    const score = Math.floor(total_amount / 1000);

    /**
     * GET CURRENT PLAYER
     */

    const {
      data: currentPlayer,
    } = await supabase
      .from("players")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    /**
     * CALCULATE TOTALS
     */

    const totalSpent =
      (currentPlayer?.total_spent || 0) +
      total_amount;

    const totalCoins =
      (currentPlayer?.coins || 0) +
      coins;

    const totalScore =
      (currentPlayer?.score || 0) +
      score;

    const totalSpins =
      (currentPlayer?.spins || 0) +
      spins;

    const totalOrders =
      (currentPlayer?.total_orders || 0) +
      1;

    /**
     * LEVEL
     */

    const level = getMemberLevel(totalSpent);

    /**
     * UPSERT PLAYER
     */

    const { error } = await supabase
      .from("players")
      .upsert(
        {
          user_id,

          name: customer_name,

          coins: totalCoins,

          score: totalScore,

          spins: totalSpins,

          total_orders: totalOrders,

          total_spent: totalSpent,

          level,
        },
        {
          onConflict: "user_id",
        }
      );

    if (error) {
      console.log(error);

      return res.status(500).json({
        success: false,
        error,
      });
    }

    res.json({
      success: true,

      reward: {
        spins,
        coins,
        score,
      },

      level,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DAILY CHECKIN
 */

app.post("/api/checkin", async (req, res) => {
  try {
    const {
      user_id,
      name,
    } = req.body;

    const today = new Date()
      .toISOString()
      .split("T")[0];

    const {
      data: player,
    } = await supabase
      .from("players")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    if (player?.last_checkin === today) {
      return res.json({
        success: false,
        message: "Bạn đã điểm danh hôm nay",
      });
    }

    const newStreak =
      (player?.streak || 0) + 1;

    const reward = newStreak * 10;

    const { error } = await supabase
      .from("players")
      .upsert(
        {
          user_id,

          name,

          streak: newStreak,

          last_checkin: today,

          coins:
            (player?.coins || 0) + reward,
        },
        {
          onConflict: "user_id",
        }
      );

    if (error) {
      return res.status(500).json({
        success: false,
        error,
      });
    }

    res.json({
      success: true,
      streak: newStreak,
      reward,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * APP CONFIG
 */

app.get("/api/app-config", async (req, res) => {
  try {
    const {
      data,
      error,
    } = await supabase
      .from("app_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        success: false,
        error,
      });
    }

    res.json(data);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * BANNERS API
 */

app.get("/api/banners", async (req, res) => {
  try {
    const {
      data,
      error,
    } = await supabase
      .from("banners")
      .select("*")
      .eq("is_active", true)
      .order("id", {
        ascending: false,
      });

    if (error) {
      return res.status(500).json({
        success: false,
        error,
      });
    }

    res.json(data);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POPUP CAMPAIGN API
 */

app.get(
  "/api/popup-campaign",
  async (req, res) => {
    try {
      const {
        data,
        error,
      } = await supabase
        .from("popup_campaigns")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (error) {
        return res.status(500).json({
          success: false,
          error,
        });
      }

      res.json(data);
    } catch (error) {
      console.log(error);

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * VOUCHERS CENTER API
 */

app.get(
  "/api/vouchers-center",
  async (req, res) => {
    try {
      const {
        data,
        error,
      } = await supabase
        .from("vouchers")
        .select("*")
        .eq("is_active", true)
        .order("id", {
          ascending: false,
        });

      if (error) {
        return res.status(500).json({
          success: false,
          error,
        });
      }

      res.json(data);
    } catch (error) {
      console.log(error);

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * CLAIM VOUCHER
 */

app.post(
  "/api/claim-voucher",
  async (req, res) => {
    try {
      const {
        user_id,
        voucher_id,
      } = req.body;

      /**
       * PLAYER
       */

      const {
        data: player,
      } = await supabase
        .from("players")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle();

      /**
       * VOUCHER
       */

      const {
        data: voucher,
      } = await supabase
        .from("vouchers")
        .select("*")
        .eq("id", voucher_id)
        .maybeSingle();

      if (!player || !voucher) {
        return res.status(400).json({
          success: false,
          message: "Không tìm thấy dữ liệu",
        });
      }

      if (
        (player?.coins || 0) <
        voucher.coin_cost
      ) {
        return res.status(400).json({
          success: false,
          message: "Không đủ coin",
        });
      }

      /**
       * UPDATE PLAYER COINS
       */

      const { error: updateError } =
        await supabase
          .from("players")
          .update({
            coins:
              player.coins -
              voucher.coin_cost,
          })
          .eq("user_id", user_id);

      if (updateError) {
        return res.status(500).json({
          success: false,
          error: updateError,
        });
      }

      /**
       * SAVE USER VOUCHER
       */

      const { error: saveError } =
        await supabase
          .from("user_vouchers")
          .insert({
            user_id,

            voucher_id,

            voucher_title:
              voucher.title,
          });

      if (saveError) {
        return res.status(500).json({
          success: false,
          error: saveError,
        });
      }

      res.json({
        success: true,
        message: "Đổi voucher thành công",
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * USER PROFILE API
 */

app.get(
  "/api/profile/:userId",
  async (req, res) => {
    try {
      const { userId } = req.params;

      const {
        data: player,
        error,
      } = await supabase
        .from("players")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        return res.status(500).json({
          success: false,
          error,
        });
      }

      const {
        data: vouchers,
      } = await supabase
        .from("user_vouchers")
        .select("*")
        .eq("user_id", userId)
        .order("id", {
          ascending: false,
        });

      res.json({
        player,
        vouchers,
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * START SERVER
 */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});