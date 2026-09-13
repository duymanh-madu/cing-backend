"use strict";

const express =
  require("express");

const {
  requirePanelPermission,
} = require(
  "../middlewares/adminPanelPermissionMiddleware"
);

const {
  assertPosCounterEnabled,
  listPosSessions,
  getPosSessionById,
  recoverPosSessionQr,
  freezeAmountAndCreateQr,
  listPosReconciliationAlerts,
} = require(
  "../services/wallet/cingWalletPosSessionService"
);


const router =
  express.Router();


function sendError(
  res,
  error
) {
  return res
    .status(
      Number(
        error?.statusCode
      ) || 500
    )
    .json({
      success:
        false,

      code:
        error?.code ||
        "CING_WALLET_POS_COUNTER_FAILED",

      message:
        error?.message ||
        "Không thể xử lý Cing Wallet POS Counter",
    });
}


function requireCounterEnabled(
  req,
  res,
  next
) {
  try {
    assertPosCounterEnabled();
    return next();
  } catch (error) {
    return sendError(
      res,
      error
    );
  }
}


function resolveActorId(
  req
) {
  const id =
    req?.admin?.id;

  if (
    id === undefined ||
    id === null ||
    id === ""
  ) {
    return null;
  }

  const normalized =
    String(id).trim();

  return normalized ||
    null;
}


router.use(
  requirePanelPermission(
    "wallet.pos.operate"
  )
);

router.use(
  requireCounterEnabled
);


router.get(
  "/reconciliation-alerts",
  async (
    req,
    res
  ) => {
    try {
      const data =
        await listPosReconciliationAlerts({
          status:
            req.query?.status ||
            "open",

          limit:
            req.query?.limit ||
            100,
        });

      return res.json({
        success:
          true,

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



router.get(
  "/sessions",
  async (
    req,
    res
  ) => {
    try {
      const data =
        await listPosSessions({
          status:
            req.query?.status,

          limit:
            req.query?.limit ||
            50,
        });

      return res.json({
        success:
          true,

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


router.get(
  "/sessions/:sessionId/qr",
  async (
    req,
    res
  ) => {
    try {
      const data =
        await recoverPosSessionQr(
          req.params
            .sessionId
        );

      return res.json({
        success:
          true,

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



router.get(
  "/sessions/:sessionId",
  async (
    req,
    res
  ) => {
    try {
      const data =
        await getPosSessionById(
          req.params
            .sessionId
        );

      return res.json({
        success:
          true,

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


router.post(
  "/sessions/:sessionId/amount",
  async (
    req,
    res
  ) => {
    try {
      const actorId =
        resolveActorId(
          req
        );

      if (!actorId) {
        return res
          .status(403)
          .json({
            success:
              false,

            code:
              "CING_WALLET_POS_COUNTER_ACTOR_REQUIRED",

            message:
              "Không xác định được tài khoản thu ngân",
          });
      }

      const allowedKeys =
        new Set([
          "amount",
        ]);

      const body =
        req.body;

      if (
        !body ||
        typeof body !==
          "object" ||
        Array.isArray(
          body
        ) ||
        Object.keys(
          body
        ).some(
          key =>
            !allowedKeys.has(
              key
            )
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            code:
              "CING_WALLET_POS_COUNTER_BODY_INVALID",

            message:
              "Dữ liệu số tiền không hợp lệ",
          });
      }

      const data =
        await freezeAmountAndCreateQr({
          sessionId:
            req.params
              .sessionId,

          amount:
            body.amount,

          actorId,
        });

      return res.json({
        success:
          true,

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


module.exports =
  router;
