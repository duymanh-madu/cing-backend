module.exports =
  function (
    req,
    res,
    next
  ) {

    try {

      const {

        game_key,
        user_id,
        score,

      } = req.body;

      /**
       * REQUIRED
       */

      if (
        !game_key ||
        !user_id ||
        score === undefined
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Thiếu dữ liệu",

        });

      }

      /**
       * SCORE TYPE
       */

      if (
        typeof score !==
        "number"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Score không hợp lệ",

        });

      }

      /**
       * NEGATIVE
       */

      if (score < 0) {

        return res.status(400).json({

          success: false,

          message:
            "Score âm không hợp lệ",

        });

      }

      /**
       * LIMIT
       */

      if (
        score > 1000000
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Score vượt giới hạn",

        });

      }

      /**
       * VALID GAMES
       */

      const validGames = [
        "black-pearl-rush",
        "cing-stack-tower",
        "chess",
      ];

      if (
        !validGames.includes(
          game_key
        )
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Game không hợp lệ",

        });

      }

      next();

    } catch (error) {

      console.log(error);

      res.status(500).json({

        success: false,

      });

    }

  };