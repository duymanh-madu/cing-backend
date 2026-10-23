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

const {
  purchaseVersionedGameplayContinue,
} = require(
  "../services/games/cingBlockPuzzle/cingBlockPuzzleContinueDispatchService"
);

const router =
  express.Router();
router.use(require("../services/games/cingBlockPuzzle/performance/requestTiming").blockPuzzleTiming);

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

  const payload = {
    success: false,

    code:
      error?.code ||
      fallbackCode,

    message:
      error?.message ||
      fallbackMessage,
  };

  if (
    error?.data &&
    typeof error.data ===
      "object"
  ) {
    payload.data =
      error.data;
  }

  return res
    .status(statusCode)
    .json(payload);
}

const prepareLimiter = require("express-rate-limit")({windowMs:10000,max:5,standardHeaders:true,legacyHeaders:false});
router.get("/weekly-progress", authMiddleware, async (req,res) => {
  try {
    const { getWeeklyProgress } = require("../services/games/cingBlockPuzzle/cingBlockPuzzleWeeklyProgressService");
    const data = await getWeeklyProgress({customer:req.customer});
    res.set("Cache-Control","private, no-store");
    return res.json({success:true,data});
  } catch(error) { return sendBlockPuzzleError(res,error,"BLOCK_PUZZLE_PROGRESS_UNAVAILABLE","Chưa tải được BXH tuần"); }
});
router.post("/session/:session_id/prepare", authMiddleware, prepareLimiter, async (req, res) => {
  const started = performance.now();
  try {
    const { prepareGameplayDecision } = require("../services/games/cingBlockPuzzle/cingBlockPuzzlePrepareService");
    const data = await prepareGameplayDecision({customer:req.customer,sessionId:req.params.session_id,body:req.body});
    res.set("Server-Timing", `prepare;dur=${(performance.now()-started).toFixed(1)}`);
    return res.json({success:true,data});
  } catch(error) { return sendBlockPuzzleError(res,error,"BLOCK_PUZZLE_PREPARE_FAILED","Chưa chuẩn bị được ván"); }
});

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
  "/session/:session_id/continue",
  authMiddleware,
  gameScoreLimiter,
  async (req, res) => {
    try {
      const data =
        await purchaseVersionedGameplayContinue({
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
        "BLOCK_PUZZLE_CONTINUE_PURCHASE_FAILED",
        "Không thể mua mạng"
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
