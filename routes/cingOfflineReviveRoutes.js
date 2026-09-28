"use strict";

const express = require("express");

const authMiddleware =
  require("../middlewares/authMiddleware");

const {
  gameScoreLimiter,
} = require("../middlewares/rateLimiter");

const {
  startOfflineRevival,
  enterOfflineRevivePending,
  purchaseOfflineRevival,
  finalizeOfflineRevival,
  getOfflineReviveCreditBalance,
  recoverOfflineRevival,
} = require(
  "../services/games/revival/cingOfflineReviveService"
);

const {
  getReviveCreditAdminPrice,
} = require(
  "../services/games/revival/cingReviveCreditAdminPriceService"
);

const CUSTOMER_PRICE_FLAG =
  "CING_GAME_ECONOMY_V2_HTTP_ENABLED";

const router = express.Router();

/*
 * CING GAME CENTER V2
 *
 * Routes for the new PostgreSQL-backed
 * offline revival lifecycle:
 *
 * - cing-stack-tower
 * - black-pearl-rush
 *
 * These routes do not serve Block Puzzle.
 *
 * Customer identity comes exclusively
 * from the existing authMiddleware.
 *
 * PostgreSQL owns session transitions,
 * idempotency and credit debits.
 */

function sendRevivalError(
  res,
  error,
  fallbackCode
) {
  const candidate =
    Number(error?.statusCode);

  const statusCode =
    Number.isInteger(candidate) &&
    candidate >= 400 &&
    candidate <= 599
      ? candidate
      : 500;

  const code =
    typeof error?.code === "string" &&
    error.code.length > 0
      ? error.code
      : fallbackCode;

  /*
   * Do not return raw database errors
   * if an unexpected exception reaches
   * this HTTP boundary.
   */

  const message =
    typeof error?.statusCode === "number" &&
    typeof error?.message === "string"
      ? error.message
      : "Không thể xử lý yêu cầu hồi sinh";

  return res
    .status(statusCode)
    .json({
      success: false,
      code,
      message,
    });
}

/*
 * POST /session
 *
 * Body:
 * {
 *   request_id: UUID,
 *   game_key:
 *     "cing-stack-tower" |
 *     "black-pearl-rush"
 * }
 *
 * PostgreSQL atomically consumes one
 * game play for each new session.
 * Exact request replay consumes none.
 */


/*
 * Authenticated read-only revival surfaces.
 *
 * Neither GET route creates a session,
 * consumes game plays or Revive Credit,
 * nor submits or finalizes scores.
 */

/*
 * GET /api/game/offline-revival/price
 *
 * Authenticated read-only customer price.
 * Same canonical Admin-configured Wallet
 * price for both Wallet and loyalty points.
 *
 * No direct balance or payment mutation.
 * Do not expose Admin price-write authority.
 *
 * Default OFF with Game Economy V2.
 */
router.get(
  "/price",
  authMiddleware,
  async (req, res) => {
    if (
      process.env[CUSTOMER_PRICE_FLAG] !==
      "true"
    ) {
      return res.status(503).json({
        success: false,
        code:
          "REVIVE_CUSTOMER_PRICE_NOT_ENABLED",
      });
    }

    try {
      const price =
        await getReviveCreditAdminPrice();

      if (
        !price ||
        typeof price.enabled !== "boolean" ||
        (
          price.enabled === false &&
          (
            price.price_vnd !== null ||
            price.points_cost !== null
          )
        ) ||
        (
          price.enabled === true &&
          (
            price.price_vnd === null ||
            price.points_cost === null
          )
        )
      ) {
        throw new Error(
          "REVIVE_CUSTOMER_PRICE_INVALID"
        );
      }

      return res.json({
        success: true,
        data: {
          enabled: price.enabled,
          price_vnd:
            price.price_vnd,
          points_cost:
            price.points_cost,
        },
      });
    } catch {
      return res.status(503).json({
        success: false,
        code:
          "REVIVE_CUSTOMER_PRICE_UNVERIFIED",
      });
    }
  }
);

router.get(
  "/balance",
  authMiddleware,
  async (req, res) => {
    try {
      const data =
        await getOfflineReviveCreditBalance({
          customer: req.customer,
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return sendRevivalError(
        res,
        error,
        "REVIVAL_BALANCE_READ_FAILED"
      );
    }
  }
);

router.get(
  "/session/recover/:request_id",
  authMiddleware,
  async (req, res) => {
    try {
      const data =
        await recoverOfflineRevival({
          customer: req.customer,
          requestId: req.params.request_id,
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return sendRevivalError(
        res,
        error,
        "REVIVAL_SESSION_RECOVERY_FAILED"
      );
    }
  }
);

router.post(
  "/session",
  authMiddleware,
  async (req, res) => {
    try {
      const data =
        await startOfflineRevival({
          customer: req.customer,
          requestId:
            req.body?.request_id,
          gameKey:
            req.body?.game_key,
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return sendRevivalError(
        res,
        error,
        "REVIVAL_SESSION_START_FAILED"
      );
    }
  }
);

/*
 * POST /session/:session_id/pending
 *
 * Body:
 * {
 *   request_id: UUID,
 *   expected_event_seq: integer,
 *   reason: "timeout" | "death"
 * }
 *
 * Never spends revive credits.
 */

router.post(
  "/session/:session_id/pending",
  authMiddleware,
  gameScoreLimiter,
  async (req, res) => {
    try {
      const data =
        await enterOfflineRevivePending({
          customer: req.customer,
          sessionId:
            req.params.session_id,
          requestId:
            req.body?.request_id,
          expectedEventSeq:
            req.body?.expected_event_seq,
          reason:
            req.body?.reason,
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return sendRevivalError(
        res,
        error,
        "REVIVAL_PENDING_FAILED"
      );
    }
  }
);

/*
 * POST /session/:session_id/revive
 *
 * Body:
 * {
 *   request_id: UUID,
 *   expected_event_seq: integer,
 *   pending_event_id:
 *     positive PostgreSQL bigint
 * }
 *
 * No client-provided cost is forwarded.
 *
 * PostgreSQL atomically debits credits,
 * writes the revived event and
 * returns the session to active.
 */

router.post(
  "/session/:session_id/revive",
  authMiddleware,
  gameScoreLimiter,
  async (req, res) => {
    try {
      const data =
        await purchaseOfflineRevival({
          customer: req.customer,
          sessionId:
            req.params.session_id,
          requestId:
            req.body?.request_id,
          expectedEventSeq:
            req.body?.expected_event_seq,
          pendingEventId:
            req.body?.pending_event_id,
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return sendRevivalError(
        res,
        error,
        "REVIVAL_APPLY_FAILED"
      );
    }
  }
);

/*
 * POST /session/:session_id/finalize
 *
 * Final score is reported once when
 * the player declines revival or
 * the revival limit is exhausted.
 *
 * PostgreSQL owns session identity,
 * finalization and exactly-once score
 * persistence.
 *
 * No client-provided user_id, game_key,
 * score_id or credit_cost is forwarded.
 */

router.post(
  "/session/:session_id/finalize",
  authMiddleware,
  gameScoreLimiter,
  async (req, res) => {
    try {
      const data =
        await finalizeOfflineRevival({
          customer: req.customer,
          sessionId:
            req.params.session_id,
          requestId:
            req.body?.request_id,
          expectedEventSeq:
            req.body?.expected_event_seq,
          finalScore:
            req.body?.final_score,
          finalBestCombo:
            req.body?.final_best_combo,
          playerName:
            req.body?.player_name,
          avatar:
            req.body?.avatar,
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return sendRevivalError(
        res,
        error,
        "REVIVAL_FINALIZE_FAILED"
      );
    }
  }
);

module.exports = router;
