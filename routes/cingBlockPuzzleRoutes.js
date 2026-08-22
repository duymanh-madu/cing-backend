const express =
  require("express");

const authMiddleware =
  require(
    "../middlewares/authMiddleware"
  );

const {
  gameScoreLimiter,
} = require(
  "../middlewares/rateLimiter"
);

const {
  startGameplaySession,
} = require(
  "../services/games/cingBlockPuzzle/cingBlockPuzzleSessionService"
);

const {
  submitGameplaySession,
} = require(
  "../services/games/cingBlockPuzzle/cingBlockPuzzleSubmitService"
);

const router =
  express.Router();

function sendBlockPuzzleError(
  res,
  error,
  fallbackCode,
  fallbackMessage
) {
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
        fallbackCode,

      message:
        error?.message ||
        fallbackMessage,
    });
}

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
      return sendBlockPuzzleError(
        res,
        error,
        "BLOCK_PUZZLE_SESSION_START_FAILED",
        "Không thể bắt đầu ván chơi"
      );
    }
  }
);

router.post(
  "/session/:session_id/submit",
  authMiddleware,
  gameScoreLimiter,
  async (req, res) => {
    try {
      const data =
        await submitGameplaySession({
          customer:
            req.customer,

          sessionId:
            req.params.session_id,

          body:
            req.body,
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return sendBlockPuzzleError(
        res,
        error,
        "BLOCK_PUZZLE_SESSION_SUBMIT_FAILED",
        "Không thể xác thực kết quả ván chơi"
      );
    }
  }
);

module.exports =
  router;
