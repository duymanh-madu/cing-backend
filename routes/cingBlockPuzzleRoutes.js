const express =
  require("express");

const authMiddleware =
  require(
    "../middlewares/authMiddleware"
  );

const {
  startGameplaySession,
} = require(
  "../services/games/cingBlockPuzzle/cingBlockPuzzleSessionService"
);

const router =
  express.Router();

router.post(
  "/session",
  authMiddleware,
  async (req, res) => {
    try {
      const data =
        await startGameplaySession({
          customer:
            req.customer,

          requestId:
            req.body?.request_id,
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      const statusCode =
        Number(
          error?.statusCode
        ) || 500;

      return res
        .status(statusCode)
        .json({
          success: false,
          code:
            error?.code ||
            "BLOCK_PUZZLE_SESSION_START_FAILED",
          message:
            error?.message ||
            "Không thể bắt đầu ván chơi",
        });
    }
  }
);

module.exports =
  router;
