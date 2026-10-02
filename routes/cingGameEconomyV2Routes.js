"use strict";

/*
 * CING GAME CENTER V2 — ECONOMY
 *
 * Mounted at /api/game/economy-v2.
 *
 * Every operation retains an explicit default-OFF
 * feature gate. Mounting does not activate purchases.
 *
 * No client-controlled sender identity or price.
 */

const express =
  require("express");

const supabase =
  require("../supabase");

const {
  normalizePhone,
} = require("../utils/phoneIdentity");



const {
  buyReviveCreditsWithPoints,
} = require(
  "../services/games/revival/cingPointsBuyReviveCreditsService"
);

const {
  purchaseGameGift,
} = require(
  "../services/games/revival/cingGameGiftPurchaseService"
);

const {
  getCustomerGameGiftCatalog,
} = require(
  "../services/games/revival/cingGameGiftCustomerCatalogService"
);

const ENABLE_FLAG =
  "CING_GAME_ECONOMY_V2_HTTP_ENABLED";

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
        "CING_GAME_ECONOMY_NOT_ENABLED",
      message:
        "Tính năng hiện chưa mở",
    });
  }

  return next();
}

function respondError(
  res,
  error
) {
  const status =
    Number(
      error?.statusCode
    );

  return res.status(
    Number.isSafeInteger(status) &&
    status >= 400 &&
    status <= 599
      ? status
      : 500
  ).json({
    success: false,
    code:
      error?.code ||
      "CING_GAME_ECONOMY_FAILED",

    message:
      error?.message ||
      "Chưa thể xác minh giao dịch",
  });
}

/*
 * authMiddleware must be supplied by the existing
 * authenticated route assembly.
 *
 * No fallback identity middleware is permitted.
 */
function createCingGameEconomyV2Router({
  authMiddleware,
}) {
  if (
    typeof authMiddleware !==
      "function"
  ) {
    throw new Error(
      "CING_GAME_ECONOMY_AUTH_REQUIRED"
    );
  }

  const router =
    express.Router();

  router.get(
    "/gifts/catalog",
    authMiddleware,
    disabledGate,
    async (req, res) => {
      try {
        const data =
          await getCustomerGameGiftCatalog();

        return res.json({
          success: true,
          data,
        });
      } catch (error) {
        return respondError(
          res,
          error
        );
      }
    }
  );

  router.post(
    "/revive-credits/points",
    authMiddleware,
    disabledGate,
    async (req, res) => {
      try {
        const data =
          await buyReviveCreditsWithPoints({
            customer:
              req.customer,

            quantity:
              req.body?.quantity,

            requestId:
              req.body?.request_id,
          });

        return res.json({
          success: true,
          data,
        });
      } catch (error) {
        return respondError(
          res,
          error
        );
      }
    }
  );

  router.post(
    "/gifts/wallet",
    authMiddleware,
    disabledGate,
    async (req, res) => {
      try {
        const data =
          await purchaseGameGift({
            customer:
              req.customer,

            recipientUserId:
              req.body?.recipient_user_id,

            giftId:
              req.body?.gift_id,

            requestId:
              req.body?.request_id,

            senderMessage:
              req.body?.sender_message,

            fundingSource:
              "wallet",
          });

        return res.json({
          success: true,
          data,
        });
      } catch (error) {
        return respondError(
          res,
          error
        );
      }
    }
  );

  router.post(
    "/gifts/points",
    authMiddleware,
    disabledGate,
    async (req, res) => {
      try {
        const data =
          await purchaseGameGift({
            customer:
              req.customer,

            recipientUserId:
              req.body?.recipient_user_id,

            giftId:
              req.body?.gift_id,

            requestId:
              req.body?.request_id,

            senderMessage:
              req.body?.sender_message,

            fundingSource:
              "points",
          });

        return res.json({
          success: true,
          data,
        });
      } catch (error) {
        return respondError(
          res,
          error
        );
      }
    }
  );

  /*
   * CING_GIFT_NOTIFICATION_READ_V1
   *
   * Read only.
   * The authenticated customer selects the recipient.
   * No client-supplied user_id may select another inbox.
   *
   * Existing generic Notification Center routes are
   * deliberately not modified by this feature route.
   */
  /* N09: Read-only sender display names for the authenticated recipient.
   * Never accept sender identity from the client and never expose phone.
   */
  async function withGiftSenderNames(rows) {
    const senders = [...new Set((rows || [])
      .map(row => String(row?.metadata?.fromUserId || ""))
      .filter(value => /^0[0-9]{9}$/.test(value)))];
    if (!senders.length) return rows || [];
    const { data: players, error } = await supabase
      .from("players")
      .select("user_id, display_name, zalo_name, name")
      .in("user_id", senders);
    if (error) return rows || [];
    const names = new Map((players || []).map(player => [
      String(player.user_id),
      [player.display_name, player.zalo_name, player.name]
        .find(value => typeof value === "string" && value.trim())?.trim() || null,
    ]));
    return (rows || []).map(row => {
      const name = names.get(String(row?.metadata?.fromUserId || ""));
      return name ? {
        ...row,
        metadata: { ...row.metadata, fromName: name },
      } : row;
    });
  }

  router.get(
    "/gifts/notifications",
    authMiddleware,
    disabledGate,
    async (req, res) => {
      try {
        const phone = normalizePhone(
          req.customer?.phone || ""
        );

        if (!/^0[0-9]{9}$/.test(phone)) {
          return res.status(403).json({
            success: false,
            code: "GAME_GIFT_IDENTITY_REQUIRED",
          });
        }

        // N13: Preserve the original latest-50 history response.
        // Background recovery can request contiguous ID pages after a cursor.
        const rawAfter = req.query?.after_id;
        const incremental = rawAfter !== undefined;
        if (incremental && (
          typeof rawAfter !== "string" ||
          !/^(0|[1-9][0-9]{0,18})$/.test(rawAfter) ||
          BigInt(rawAfter) > 9223372036854775807n
        )) {
          return res.status(400).json({
            success: false,
            code: "GAME_GIFT_CURSOR_INVALID",
          });
        }

        let query = supabase
          .from("notifications")
          .select(
            "id, type, title, message, metadata, is_read, created_at"
          )
          .eq("user_id", phone)
          .eq("type", "gift_received")
          .contains("metadata", {
            source: "cing_game_gift_purchase_v1",
          });

        if (incremental) {
          query = query.gt("id", rawAfter).order("id", {
            ascending: true,
          });
        } else {
          query = query.order("created_at", {
            ascending: false,
          });
        }
        const { data, error } = await query.limit(50);

        if (error) {
          throw error;
        }

        return res.json({
          success: true,
          data: await withGiftSenderNames(data || []),
        });
      } catch (error) {
        return respondError(res, error);
      }
    }
  );

  /*
   * CING_GIFT_NOTIFICATION_MARK_READ_V1
   *
   * Only the authenticated recipient may mark
   * their own Economy V2 Gift as read.
   *
   * Notification ID is a selector, never identity.
   * Empty or bulk mark-read is not supported.
   */
  router.post(
    "/gifts/notifications/:notificationId/read",
    authMiddleware,
    disabledGate,
    async (req, res) => {
      try {
        const phone = normalizePhone(
          req.customer?.phone || ""
        );

        if (!/^0[0-9]{9}$/.test(phone)) {
          return res.status(403).json({
            success: false,
            code: "GAME_GIFT_IDENTITY_REQUIRED",
          });
        }

        const rawId = req.params?.notificationId;

        const id =
          typeof rawId === "string"
            ? rawId
            : "";

        const validId =
          /^[1-9][0-9]{0,18}$/.test(id) &&
          BigInt(id) <= 9223372036854775807n;

        if (!validId) {
          return res.status(400).json({
            success: false,
            code: "GAME_GIFT_NOTIFICATION_ID_INVALID",
          });
        }

        const { data, error } = await supabase
          .from("notifications")
          .update({
            is_read: true,
          })
          .eq("id", id)
          .eq("user_id", phone)
          .eq("type", "gift_received")
          .contains("metadata", {
            source: "cing_game_gift_purchase_v1",
          })
          .select("id")
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          return res.status(404).json({
            success: false,
            code: "GAME_GIFT_NOTIFICATION_NOT_FOUND",
          });
        }

        return res.json({
          success: true,
          data: {
            id: String(data.id),
            is_read: true,
          },
        });
      } catch (error) {
        return respondError(res, error);
      }
    }
  );

  return router;
}

module.exports = {
  createCingGameEconomyV2Router,
};
