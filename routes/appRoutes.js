const express =
  require("express");

const router =
  express.Router();

router.get(
  "/test",
  async (req, res) => {

    res.json({

      success: true,

      route:
        "app routes working",

    });

  }
);

module.exports =
  router;