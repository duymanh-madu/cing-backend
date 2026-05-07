const express = require("express");
const axios = require("axios");

const app = express();

const PORT = 5050;

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

    const response = await axios.get(
      "https://api.foodbook.vn/ipos/ws/xpartner/v2/items",
      {
        params: {
          access_token: "4ETARZYY813AS5LEKOOCD1NP61Y6J55C",
          pos_parent: "APP_CINGHUTANG",
          pos_id: "10000343",
        },
        timeout: 10000,
      }
    );

    res.json(response.data);

  } catch (error) {

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
          access_token: "4ETARZYY813AS5LEKOOCD1NP61Y6J55C",
          pos_parent: "APP_CINGHUTANG",
          user_id: userId,
        },
      }
    );

    res.json(response.data);

  } catch (error) {

    res.status(500).json({
      error: error.message,
    });

  }

});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});