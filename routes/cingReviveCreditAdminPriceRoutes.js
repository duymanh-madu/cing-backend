"use strict";

const express =
  require("express");

const {
  setReviveCreditAdminPrice,
  getReviveCreditAdminPrice,
} = require(
  "../services/games/revival/cingReviveCreditAdminPriceService"
);

const ENABLE_FLAG =
  "CING_REVIVE_ADMIN_PRICE_HTTP_ENABLED";

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
        "REVIVE_ADMIN_PRICE_NOT_ENABLED",
    });
  }

  next();
}

function sendError(
  res,
  error
) {
  const status =
    [
      400,
      403,
      409,
      502,
      503,
    ].includes(
      error?.statusCode
    )
      ? error.statusCode
      : 500;

  return res.status(status).json({
    success: false,

    code:
      error?.code ||
      "REVIVE_ADMIN_PRICE_FAILED",
  });
}

/*
 * Auth dependencies must come from
 * existing Admin authority.
 *
 * No role is accepted from the body.
 *
 * No generic Admin fallback.
 */

function createCingReviveCreditAdminPriceRouter({
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
      "REVIVE_ADMIN_AUTHORITY_REQUIRED"
    );
  }

  const router =
    express.Router();

  router.get(
    "/price",
    authMiddleware,
    requireSuperAdmin,
    disabledGate,
    async (req, res) => {
      try {
        const data =
          await getReviveCreditAdminPrice();

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

  router.put(
    "/price",
    authMiddleware,
    requireSuperAdmin,
    disabledGate,
    async (req, res) => {
      try {
        /*
         * Distinguish an explicit NULL
         * from a missing price_vnd.
         */
        if (
          !req.body ||
          !Object.prototype.hasOwnProperty.call(
            req.body,
            "price_vnd"
          )
        ) {
          return res.status(400).json({
            success: false,
            code:
              "REVIVE_ADMIN_PRICE_REQUIRED",
          });
        }

        const actorId =
          resolveAdminActor(
            req
          );

        const data =
          await setReviveCreditAdminPrice({
            actorId,

            requestId:
              req.body.request_id,

            priceVnd:
              req.body.price_vnd,
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
  createCingReviveCreditAdminPriceRouter,
};
