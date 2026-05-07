const supabase =
require("./supabase");
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

/**
 * MIDDLEWARE
 */

app.use(cors());

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
 * MENU API
 */

app.get("/api/menu", async (req, res) => {

  try {

    /**
     * CALL IPOS API
     */

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

    /**
     * SUCCESS
     */

    res.json(response.data);

  } catch (error) {

    console.log("MENU API ERROR:");

    console.log(error.message);

    /**
     * ERROR RESPONSE
     */

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

          user_id:
            userId,

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
 * START SERVER
 */
/**
 * VOUCHER API
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

          pos_parent:
            "FOODBOOK",

          user_id:
            userId,

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

app.post("/api/order-webhook",

async (req, res) => {

  try {

    /**
     * ORDER DATA
     */

    const {

      user_id,

      customer_name,

      total_amount,

    } = req.body;

    /**
     * CALCULATE REWARD
     */

    const spins =
      Math.floor(total_amount / 50000);

    const coins =
      Math.floor(total_amount / 1000);

    const score =
      Math.floor(total_amount / 1000);

    /**
     * UPDATE PLAYER
     */

    const { error } =
      await supabase

        .from("players")

        .upsert({

          user_id,

          name:
            customer_name,

          spins,

          coins,

          score,

          total_orders: 1,

        });

    if (error) {

      console.log(error);

      return res.status(500).json({

        success: false,

        error,

      });

    }

    /**
     * SUCCESS
     */

    res.json({

      success: true,

      reward: {

        spins,

        coins,

        score,

      },

    });

  } catch (error) {

    console.log(error);

    res.status(500).json({

      success: false,

      error: error.message,

    });

  }

});
app.listen(PORT, () => {

  console.log(`Server running on port ${PORT}`);

});
// voucher api updated