"use strict";

const express =
  require("express");

const {
  upsertGameGiftCatalog,
  listGameGiftCatalog,
} = require(
  "../services/games/revival/cingGameGiftCatalogAdminService"
);

const ENABLE_FLAG =
  "CING_GAME_GIFT_ADMIN_HTTP_ENABLED";

function disabledGate(
  req,
  res,
  next
) {
  if (
    process.env[ENABLE_FLAG] !==
    "true"
  ) {
    return res.status(503).json({
      success: false,
      code:
        "GAME_GIFT_ADMIN_NOT_ENABLED",
    });
  }

  next();
}

function sendError(
  res,
  error
) {
  const status =
    Number.isSafeInteger(
      error?.statusCode
    )
      ? error.statusCode
      : 500;

  return res.status(status).json({
    success: false,
    code:
      error?.code ||
      "GAME_GIFT_ADMIN_FAILED",
  });
}

/*
 * All three dependencies must be supplied
 * by the existing Admin auth assembly.
 *
 * Missing Super Admin authority is fatal;
 * no generic Admin fallback.
 */

function createCingGameGiftCatalogAdminRouter({
  authMiddleware,
  requireSuperAdmin,
  resolveAdminActor,
}) {
  if (
    typeof authMiddleware !== "function" ||
    typeof requireSuperAdmin !== "function" ||
    typeof resolveAdminActor !== "function"
  ) {
    throw new Error(
      "GAME_GIFT_ADMIN_AUTHORITY_REQUIRED"
    );
  }

  const router =
    express.Router();

  router.get(
    "/catalog",
    authMiddleware,
    requireSuperAdmin,
    disabledGate,
    async (req, res) => {
      try {
        return res.json({
          success: true,
          data:
            await listGameGiftCatalog(),
        });
      } catch (error) {
        return sendError(
          res,
          error
        );
      }
    }
  );

  router.put(
    "/catalog/:gift_id",
    authMiddleware,
    requireSuperAdmin,
    disabledGate,
    async (req, res) => {
      try {
        const actorId =
          resolveAdminActor(
            req
          );

        const data =
          await upsertGameGiftCatalog({
            actorId,

            requestId:
              req.body?.request_id,

            giftId:
              req.params.gift_id,

            name:
              req.body?.name,

            icon:
              req.body?.icon,

            priceVnd:
              req.body?.price_vnd,

            charmAward:
              req.body?.charm_award,

            enabled:
              req.body?.enabled,
          });

        return res.json({
          success: true,
          data,
        });
      } catch (error) {
        return sendError(
          res,
          error
        );
      }
    }
  );

  return router;
}

module.exports = {
  createCingGameGiftCatalogAdminRouter,
};
