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
  getCurrentManualPosSession,
  cancelManualPosSession,
  prepareManualPosPaymentQr,
  resolvePosReconciliation,

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
  "/manual-session",
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

      const data =
        await getCurrentManualPosSession({
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


router.post(
  "/manual-payment",
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
          "request_id",
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
              "Dữ liệu tạo QR không hợp lệ",
          });
      }

      if (
        !Object.prototype
          .hasOwnProperty.call(
            body,
            "amount"
          ) ||
        !Object.prototype
          .hasOwnProperty.call(
            body,
            "request_id"
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
              "Thiếu số tiền hoặc request_id",
          });
      }

      const data =
        await prepareManualPosPaymentQr({
          amount:
            body.amount,
          requestId:
            body.request_id,
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


router.post(

  "/reconciliation-alerts/:alertId/resolve",

  async (

    req,

    res

  ) => {

    try {

      if (

        req.admin?.role !==

          "super_admin"

      ) {

        return res

          .status(403)

          .json({

            success:

              false,

            code:

              "CING_WALLET_SUPER_ADMIN_REQUIRED",

            message:

              "Chỉ Super Admin được xử lý cảnh báo đối soát",

          });

      }

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

              "CING_WALLET_POS_RESOLUTION_ACTOR_REQUIRED",

            message:

              "Không xác định được Super Admin",

          });

      }

      const body =

        req.body;

      const allowedKeys =

        new Set([

          "request_id",

          "resolution_action",

          "reason_code",

          "note",

        ]);

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

              "CING_WALLET_POS_RESOLUTION_BODY_INVALID",

            message:

              "Dữ liệu xử lý đối soát không hợp lệ",

          });

      }

      const requiredKeys = [

        "request_id",

        "resolution_action",

        "reason_code",

      ];

      if (

        requiredKeys.some(

          key =>

            !Object.prototype

              .hasOwnProperty.call(

                body,

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

              "CING_WALLET_POS_RESOLUTION_BODY_INVALID",

            message:

              "Thiếu dữ liệu xử lý đối soát",

          });

      }

      const uuidPattern =

        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      const alertId =

        typeof req.params
          ?.alertId ===
          "string"

          ? req.params
              .alertId
              .trim()

          : "";

      const requestId =

        typeof body
          .request_id ===
          "string"

          ? body
              .request_id
              .trim()
              .toLowerCase()

          : "";

      if (

        !uuidPattern.test(
          alertId
        ) ||

        !uuidPattern.test(
          requestId
        )

      ) {

        return res

          .status(400)

          .json({

            success:

              false,

            code:

              "CING_WALLET_POS_RESOLUTION_ID_INVALID",

            message:

              "Mã xử lý đối soát không hợp lệ",

          });

      }

      const resolutionAction =

        typeof body
          .resolution_action ===
          "string"

          ? body
              .resolution_action
              .trim()
              .toLowerCase()

          : "";

      const allowedActions =

        new Set([

          "accept_as_is",

          "compensating_debit",

          "compensating_credit",

          "pos_correction_confirmed",

          "manual_review",

        ]);

      if (

        !allowedActions.has(
          resolutionAction
        )

      ) {

        return res

          .status(400)

          .json({

            success:

              false,

            code:

              "CING_WALLET_POS_RESOLUTION_ACTION_INVALID",

            message:

              "Hành động xử lý đối soát không hợp lệ",

          });

      }

      const reasonCode =

        typeof body
          .reason_code ===
          "string"

          ? body
              .reason_code
              .trim()
              .toLowerCase()

          : "";

      if (

        !/^[a-z0-9][a-z0-9_]{1,63}$/
          .test(
            reasonCode
          )

      ) {

        return res

          .status(400)

          .json({

            success:

              false,

            code:

              "CING_WALLET_POS_RESOLUTION_REASON_INVALID",

            message:

              "Lý do xử lý đối soát không hợp lệ",

          });

      }

      let note =
        null;

      if (

        Object.prototype
          .hasOwnProperty.call(
            body,
            "note"
          )

      ) {

        if (

          typeof body.note !==
            "string"

        ) {

          return res

            .status(400)

            .json({

              success:

                false,

              code:

                "CING_WALLET_POS_RESOLUTION_NOTE_INVALID",

              message:

                "Ghi chú xử lý đối soát không hợp lệ",

            });

        }

        note =
          body.note.trim();

        if (

          !note ||
          note.length > 1000

        ) {

          return res

            .status(400)

            .json({

              success:

                false,

              code:

                "CING_WALLET_POS_RESOLUTION_NOTE_INVALID",

              message:

                "Ghi chú xử lý đối soát không hợp lệ",

            });

        }

      }

      if (

        [

          "compensating_debit",

          "compensating_credit",

        ].includes(
          resolutionAction
        ) &&

        !note

      ) {

        return res

          .status(400)

          .json({

            success:

              false,

            code:

              "CING_WALLET_POS_RESOLUTION_NOTE_REQUIRED",

            message:

              "Điều chỉnh số dư bắt buộc phải có ghi chú",

          });

      }

      const data =

        await resolvePosReconciliation({

          alertId,

          requestId,

          resolutionAction,

          reasonCode,

          note,

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


router.get(
  "/reconciliation-alerts",
  async (
    req,
    res
  ) => {
    try {
      if (
        req.admin?.role !==
          "super_admin"
      ) {
        return res
          .status(403)
          .json({
            success:
              false,
            code:
              "CING_WALLET_SUPER_ADMIN_REQUIRED",
            message:
              "Chỉ Super Admin được xem cảnh báo đối soát",
          });
      }

      const data =
        await listPosReconciliationAlerts({
          status:
            req.query?.status ||
            "open",
          limit:
            req.query?.limit ||
            100,
          storeId:
            req.query?.store_id ||
            null,
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



router.post(
  "/manual-session/:sessionId/cancel",
  async (req, res) => {
    try {
      const body =
        req.body &&
        typeof req.body === "object" &&
        !Array.isArray(req.body)
          ? req.body
          : {};

      const allowedKeys =
        new Set([
          "request_id",
          "reason"
        ]);

      const unknownKeys =
        Object.keys(body).filter(
          (key) => !allowedKeys.has(key)
        );

      if (unknownKeys.length > 0) {
        return res.status(400).json({
          success: false,
          error:
            "CING_WALLET_POS_CANCEL_BODY_INVALID"
        });
      }

      const result =
        await cancelManualPosSession({
          sessionId:
            req.params?.sessionId,
          actorId:
            resolveActorId(req),
          requestId:
            body.request_id,
          reason:
            body.reason
        });

      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      return sendError(
        res,
        error,
        "CING_WALLET_POS_CANCEL_FAILED"
      );
    }
  }
);


module.exports =
  router;
