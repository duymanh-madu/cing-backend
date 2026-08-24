"use strict";

const express =
  require("express");

const authMiddleware =
  require(
    "../middlewares/authMiddleware"
  );

const {
  gameEntryService,
  onboardingService,
  gameplaySessionService,
  matchmakingService,
} = require(
  "../services/games/cingArtillery"
);

const router =
  express.Router();

function sendCingArtilleryError(
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
      success:
        false,

      code:
        error?.code ||
        fallbackCode,

      message:
        error?.message ||
        fallbackMessage,
    });
}

function getAuthenticatedUserId(
  req
) {
  return String(
    req.customer?.id || ""
  ).trim();
}

router.get(
  "/entry",
  authMiddleware,
  async (
    req,
    res
  ) => {
    try {
      const data =
        await gameEntryService
          .getGameEntryDecision(
            getAuthenticatedUserId(
              req
            )
          );

      return res.json({
        success:
          true,

        data,
      });
    } catch (error) {
      return sendCingArtilleryError(
        res,
        error,
        "CING_ARTILLERY_ENTRY_FAILED",
        "Không thể mở Cing Piu Piu"
      );
    }
  }
);

router.post(
  "/onboarding",
  authMiddleware,
  async (
    req,
    res
  ) => {
    try {
      const data =
        await onboardingService
          .onboardCharacter({
            userId:
              getAuthenticatedUserId(
                req
              ),

            characterName:
              req.body?.character_name,

            gender:
              req.body?.gender,
          });

      return res.json({
        success:
          true,

        data,
      });
    } catch (error) {
      return sendCingArtilleryError(
        res,
        error,
        "CING_ARTILLERY_ONBOARDING_FAILED",
        "Không thể khởi tạo nhân vật Cing Piu Piu"
      );
    }
  }
);

router.post(
  "/session",
  authMiddleware,
  async (
    req,
    res
  ) => {
    try {
      const data =
        await gameplaySessionService
          .getOrCreateGameplaySession(
            getAuthenticatedUserId(
              req
            )
          );

      return res.json({
        success:
          true,

        data,
      });
    } catch (error) {
      return sendCingArtilleryError(
        res,
        error,
        "CING_ARTILLERY_GAMEPLAY_SESSION_FAILED",
        "Không thể tạo phiên chơi Cing Piu Piu"
      );
    }
  }
);

router.post(
  "/matchmaking",
  authMiddleware,
  async (
    req,
    res
  ) => {
    try {
      const data =
        await matchmakingService
          .enterMatchmaking({
            userId:
              getAuthenticatedUserId(
                req
              ),

            gameplaySessionId:
              req.body?.gameplay_session_id,
          });

      return res.json({
        success:
          true,

        data,
      });
    } catch (error) {
      return sendCingArtilleryError(
        res,
        error,
        "CING_ARTILLERY_MATCHMAKING_FAILED",
        "Không thể ghép trận Cing Piu Piu"
      );
    }
  }
);

module.exports =
  router;
