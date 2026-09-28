"use strict";

/*
 * CING GAME CENTER V2
 * Super Admin Revive Credit adjustment.
 *
 * Admin Panel JWT -> active Admin DB lookup ->
 * permission -> explicit super_admin role ->
 * PostgreSQL business authority.
 *
 * Never trust client-supplied actor identity.
 */

const express = require("express");

const {
  requirePanelPermission,
} = require(
  "../middlewares/adminPanelPermissionMiddleware"
);

const {
  adjustReviveCredits,
  getReviveAdminAdjustmentStatus,
} = require(
  "../services/games/revival/cingReviveCreditAdminAdjustmentService"
);

const router = express.Router();

const REQUEST_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REASON_CODE =
  /^[a-z0-9][a-z0-9_]{1,63}$/;

const REFERENCE_TYPE =
  /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;

const ALLOWED_FIELDS =
  new Set([
    "user_id",
    "amount",
    "request_id",
    "reason_code",
    "note",
    "reference_type",
    "reference_id",
  ]);

function requiredText(
  value,
  maxLength
) {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const text = value.trim();

  return (
    text.length > 0 &&
    text.length <= maxLength
  )
    ? text
    : null;
}

function optionalText(
  value,
  maxLength
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  return requiredText(
    value,
    maxLength
  );
}

function badRequest(
  res,
  code
) {
  return res.status(400).json({
    success: false,
    code,
  });
}

function mapError(
  res,
  error
) {
  const message =
    String(error?.message || "");

  const code =
    String(error?.code || "");

  if (
    code === "23505" &&
    message.includes(
      "REVIVE_REFERENCE_CONFLICT"
    )
  ) {
    return res.status(409).json({
      success: false,
      code:
        "REVIVE_ADMIN_REQUEST_CONFLICT",
    });
  }

  if (
    code === "P0001" &&
    message.includes(
      "INSUFFICIENT_REVIVE_CREDITS"
    )
  ) {
    return res.status(409).json({
      success: false,
      code:
        "INSUFFICIENT_REVIVE_CREDITS",
    });
  }

  if (
    code === "P0002" &&
    message.includes(
      "REVIVE_PLAYER_NOT_FOUND"
    )
  ) {
    return res.status(404).json({
      success: false,
      code:
        "REVIVE_PLAYER_NOT_FOUND",
    });
  }

  if (
    code === "42501" &&
    message.includes(
      "REVIVE_SUPER_ADMIN_REQUIRED"
    )
  ) {
    return res.status(403).json({
      success: false,
      code:
        "REVIVE_SUPER_ADMIN_REQUIRED",
    });
  }

  if (
    code === "22003" &&
    message.includes(
      "REVIVE_BALANCE_OVERFLOW"
    )
  ) {
    return res.status(409).json({
      success: false,
      code:
        "REVIVE_BALANCE_OVERFLOW",
    });
  }

  if (
    code === "22023" &&
    message.startsWith(
      "REVIVE_"
    )
  ) {
    return res.status(400).json({
      success: false,
      code:
        "REVIVE_ADMIN_REQUEST_INVALID",
    });
  }

  console.error(
    "[REVIVE ADMIN] adjustment failed:",
    message
  );

  return res.status(500).json({
    success: false,
    code:
      "REVIVE_ADMIN_ADJUSTMENT_FAILED",
  });
}

router.post(
  "/adjust",

  requirePanelPermission(
    "revive.credit.adjust"
  ),

  async (req, res) => {
    /*
     * Defense in depth:
     * permission alone is insufficient.
     */

    if (
      req.admin?.role !==
        "super_admin"
    ) {
      return res.status(403).json({
        success: false,
        code:
          "REVIVE_SUPER_ADMIN_REQUIRED",
      });
    }

    const actorId =
      requiredText(
        req.admin?.id == null
          ? null
          : String(req.admin.id),
        200
      );

    if (!actorId) {
      return res.status(403).json({
        success: false,
        code:
          "REVIVE_ADMIN_ACTOR_MISSING",
      });
    }

    const body = req.body;

    if (
      body === null ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return badRequest(
        res,
        "REVIVE_ADMIN_BODY_INVALID"
      );
    }

    if (
      Object.keys(body).some(
        (key) =>
          !ALLOWED_FIELDS.has(key)
      )
    ) {
      return badRequest(
        res,
        "REVIVE_ADMIN_BODY_INVALID"
      );
    }

    const userId =
      requiredText(
        body.user_id,
        200
      );

    const amount =
      body.amount;

    const requestId =
      requiredText(
        body.request_id,
        36
      );

    const reasonCode =
      requiredText(
        body.reason_code,
        64
      );

    const note =
      requiredText(
        body.note,
        500
      );

    const referenceType =
      optionalText(
        body.reference_type,
        80
      );

    const referenceId =
      optionalText(
        body.reference_id,
        160
      );

    if (!userId) {
      return badRequest(
        res,
        "REVIVE_ADMIN_USER_INVALID"
      );
    }

    if (
      !Number.isInteger(amount) ||
      amount === 0 ||
      amount < -2147483648 ||
      amount > 2147483647
    ) {
      return badRequest(
        res,
        "REVIVE_ADMIN_AMOUNT_INVALID"
      );
    }

    if (
      !requestId ||
      !REQUEST_UUID.test(
        requestId
      )
    ) {
      return badRequest(
        res,
        "REVIVE_ADMIN_REQUEST_ID_INVALID"
      );
    }

    if (
      !reasonCode ||
      !REASON_CODE.test(
        reasonCode
      )
    ) {
      return badRequest(
        res,
        "REVIVE_ADMIN_REASON_CODE_INVALID"
      );
    }

    if (!note) {
      return badRequest(
        res,
        "REVIVE_ADMIN_NOTE_INVALID"
      );
    }

    if (
      (
        referenceType === null
      ) !== (
        referenceId === null
      )
    ) {
      return badRequest(
        res,
        "REVIVE_ADMIN_REFERENCE_INVALID"
      );
    }

    if (
      body.reference_type != null &&
      referenceType === null
    ) {
      return badRequest(
        res,
        "REVIVE_ADMIN_REFERENCE_INVALID"
      );
    }

    if (
      body.reference_id != null &&
      referenceId === null
    ) {
      return badRequest(
        res,
        "REVIVE_ADMIN_REFERENCE_INVALID"
      );
    }

    if (
      referenceType &&
      !REFERENCE_TYPE.test(
        referenceType
      )
    ) {
      return badRequest(
        res,
        "REVIVE_ADMIN_REFERENCE_INVALID"
      );
    }

    try {
      const result =
        await adjustReviveCredits({
          user_id:
            userId,

          amount,

          request_id:
            requestId.toLowerCase(),

          reason_code:
            reasonCode,

          note,

          reference_type:
            referenceType,

          reference_id:
            referenceId,

          /*
           * Actor comes exclusively from
           * verified Admin Panel context.
           */
          actor_admin_id:
            actorId,
        });

      return res.json({
        success: true,
        data: result,
      });

    } catch (error) {
      return mapError(
        res,
        error
      );
    }
  }
);


/*
 * Read-only recovery endpoint. A not_found response is inconclusive
 * during an in-flight or delayed POST; never create a new UUID based
 * solely on this response.
 */
router.get(
  "/adjust/status/:request_id",
  requirePanelPermission("revive.credit.adjust"),
  async (req, res) => {
    if (req.admin?.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        code: "REVIVE_SUPER_ADMIN_REQUIRED",
      });
    }
    const actorId = requiredText(
      req.admin?.id == null ? null : String(req.admin.id),
      200
    );
    if (!actorId) {
      return res.status(403).json({
        success: false,
        code: "REVIVE_ADMIN_ACTOR_MISSING",
      });
    }
    const requestId = requiredText(req.params.request_id, 36);
    if (!requestId || !REQUEST_UUID.test(requestId)) {
      return badRequest(res, "REVIVE_ADMIN_REQUEST_ID_INVALID");
    }
    try {
      const result = await getReviveAdminAdjustmentStatus({
        request_id: requestId.toLowerCase(),
        actor_admin_id: actorId,
      });
      return res.json({ success: true, data: result });
    } catch (error) {
      return mapError(res, error);
    }
  }
);

module.exports = router;
