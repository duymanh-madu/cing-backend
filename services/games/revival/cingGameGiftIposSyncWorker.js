"use strict";

const { randomUUID } =
  require("node:crypto");

const supabase =
  require("../../../supabase");

const redisClient =
  require(
    "../../infrastructure/cache/redisClient"
  );

const {
  updateMemberPoint,
  findMembershipLogByNote,
} = require("../../foodbook");

const {
  sendAdminAlert,
} = require(
  "../../alerts/adminAlertService"
);

const TABLE =
  "cing_game_gift_purchases";

const LOCK_KEY =
  "cing:gift:points:ipos-sync:lock";

const ENABLE_FLAG =
  "CING_GAME_GIFT_IPOS_SYNC_WORKER_ENABLED";

const MAX_RETRIES = 6;

const MAX_PAGES = 100;

const PAGE_SIZE = 100;

const LEASE_MS =
  10 * 60 * 1000;

let running = false;

function nowIso() {
  return new Date().toISOString();
}

function buildIposNote(purchaseId) {
  const id =
    String(purchaseId || "")
      .trim()
      .toLowerCase();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
  ) {
    throw new Error(
      "game_gift_purchase_id_invalid"
    );
  }

  return `CING-GIFT-POINTS-${id}`;
}

function normalizeIposPhone(value) {
  const digits =
    String(value || "")
      .replace(/\D/g, "");

  if (
    digits.startsWith("84") &&
    digits.length === 11
  ) {
    return digits;
  }

  if (
    digits.startsWith("0") &&
    digits.length === 10
  ) {
    return "84" + digits.slice(1);
  }

  throw new Error(
    "game_gift_ipos_phone_invalid"
  );
}

function pointsOf(value) {
  const number =
    Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > 2147483647
  ) {
    throw new Error(
      "game_gift_ipos_points_invalid"
    );
  }

  return number;
}

function nextRetryIso(count) {
  const minutes = [
    1,
    5,
    15,
    60,
    360,
    1440,
  ];

  const index =
    Math.min(
      Math.max(count - 1, 0),
      minutes.length - 1
    );

  return new Date(
    Date.now() +
      minutes[index] * 60000
  ).toISOString();
}

function lookupWindow(page) {
  return {
    page,
    page_size: PAGE_SIZE,
    create_from:
      "2026-01-01 00:00:00",
    create_to:
      "2030-01-01 00:00:00",
  };
}

/*
 * Do not assume the immutable marker is on page one.
 *
 * An incomplete lookup fails closed. It must never be
 * interpreted as evidence that iPOS did not deduct.
 */
async function findIposMarker(
  phone84,
  note
) {
  for (
    let page = 1;
    page <= MAX_PAGES;
    page += 1
  ) {
    const result =
      await findMembershipLogByNote(
        phone84,
        note,
        lookupWindow(page)
      );

    if (
      !result ||
      result.success !== true
    ) {
      return {
        success: false,
        found: false,
        error:
          result?.error ||
          "membership_log_lookup_failed",
      };
    }

    if (result.found) {
      return result;
    }

    const scanned =
      Number(
        result.scanned_count
      );

    if (
      !Number.isSafeInteger(scanned) ||
      scanned < 0 ||
      scanned > PAGE_SIZE
    ) {
      return {
        success: false,
        found: false,
        error:
          "membership_log_pagination_invalid",
      };
    }

    if (scanned < PAGE_SIZE) {
      return {
        ...result,
        found: false,
      };
    }
  }

  return {
    success: false,
    found: false,
    error:
      "membership_log_pagination_limit_exceeded",
  };
}

async function releaseStuckRows() {
  const { data, error } =
    await supabase.rpc(
      "cing_game_gift_ipos_release_stuck_v1"
    );

  if (
    error ||
    !Number.isSafeInteger(data) ||
    data < 0
  ) {
    throw new Error(
      "game_gift_release_stuck_failed:" +
      (error?.message || "invalid_rpc_result")
    );
  }

  return data;
}

async function claimPendingRows(batchSize) {
  const { data, error } =
    await supabase.rpc(
      "cing_game_gift_ipos_claim_pending_v1",
      {
        p_batch_size: batchSize,
      }
    );

  if (
    error ||
    !Array.isArray(data)
  ) {
    throw new Error(
      "game_gift_claim_pending_failed:" +
      (error?.message || "invalid_rpc_result")
    );
  }

  return data;
}

async function firstAttempt(row) {
  /*
   * CING_GAME_GIFT_IPOS_LEASE_FENCE_V1
   *
   * PostgreSQL validates the active lease and
   * owns the durable NULL -> timestamp transition.
   *
   * Even an already-attempted row must pass
   * through the RPC.
   */
  const { data, error } =
    await supabase.rpc(
      "cing_game_gift_ipos_first_attempt_v1",
      {
        p_purchase_id: row.id,
        p_locked_until: row.ipos_locked_until,
      }
    );

  if (error) {
    throw new Error(
      error.message ||
      "game_gift_first_attempt_unconfirmed"
    );
  }

  if (
    !data ||
    !data.row ||
    data.row.id !== row.id ||
    typeof data.send_allowed !== "boolean"
  ) {
    throw new Error(
      "game_gift_first_attempt_unconfirmed"
    );
  }

  return {
    row: data.row,
    sendAllowed: data.send_allowed,
  };
}

async function markSynced(row) {
  /*
   * Caller verifies the immutable iPOS marker.
   * PostgreSQL validates the delivery lease.
   */
  const { data, error } =
    await supabase.rpc(
      "cing_game_gift_ipos_mark_synced_v1",
      {
        p_purchase_id: row.id,
        p_locked_until: row.ipos_locked_until,
      }
    );

  if (
    error ||
    data !== true
  ) {
    throw new Error(
      "game_gift_mark_synced_failed:" +
      (error?.message || "status_conflict")
    );
  }
}

async function markFailed(row, reason) {
  /*
   * PostgreSQL owns retry count, schedule,
   * terminal state and lease fencing.
   *
   * The durable first-attempt field is never reset.
   */
  const { data, error } =
    await supabase.rpc(
      "cing_game_gift_ipos_mark_failed_v1",
      {
        p_purchase_id: row.id,
        p_locked_until: row.ipos_locked_until,
        p_reason: String(reason || "")
          .slice(0, 1000),
      }
    );

  if (
    error ||
    !data ||
    !Number.isSafeInteger(data.retry_count) ||
    data.retry_count < 1 ||
    typeof data.terminal !== "boolean" ||
    data.status !== (
      data.terminal ? "failed" : "pending"
    )
  ) {
    throw new Error(
      "game_gift_mark_failed_failed:" +
      (error?.message || "invalid_rpc_result")
    );
  }

  if (data.terminal) {
    await sendAdminAlert({
      title:
        "Đồng bộ điểm mua Gift thất bại",

      message:
        `Purchase ${row.id} / ${row.sender_user_id}: ` +
        `-${row.points_cost} điểm, ` +
        `${data.retry_count} attempts. ${reason}`,

      source:
        "cing_game_gift_ipos_sync_failed",
    }).catch(() => {});
  }

  return data;
}

/*
 * Explicitly OFF unless activated in an authorized
 * release. Financial processing remains explicitly gated.
 */
async function
processCingGameGiftIposSyncQueue({
  batchSize = 10,
} = {}) {
  if (
    process.env[ENABLE_FLAG] !==
    "true"
  ) {
    return {
      success: true,
      skipped: true,
      reason:
        "worker_disabled",
    };
  }

  if (running) {
    return {
      success: true,
      skipped: true,
      reason:
        "already_running",
    };
  }

  if (
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 100
  ) {
    throw new Error(
      "game_gift_batch_size_invalid"
    );
  }

  running = true;

  const token =
    randomUUID();

  let lockOwned = false;

  try {
    const lock =
      await redisClient.set(
        LOCK_KEY,
        token,
        "NX",
        "EX",
        240
      ).catch(() => null);

    if (!lock) {
      return {
        success: true,
        skipped: true,
        reason:
          "lock_unavailable",
      };
    }

    lockOwned = true;

    await releaseStuckRows();

    const rows =
      await claimPendingRows(
        batchSize
      );

    const stats = {
      total:
        rows.length,

      success: 0,
      failed: 0,
    };

    for (const raw of rows) {
      let row = raw;

      try {
        const points =
          pointsOf(
            row.points_cost
          );


        const phone84 =
          normalizeIposPhone(
            row.sender_user_id
          );

        const note =
          buildIposNote(
            row.id
          );

        const preflight =
          await findIposMarker(
            phone84,
            note
          );

        if (
          !preflight.success
        ) {
          throw new Error(
            "game_gift_preflight:" +
            preflight.error
          );
        }

        if (!preflight.found) {
          /*
           * CING_GAME_GIFT_IPOS_SINGLE_SEND_FENCE_V1
           *
           * Only the winner of the durable NULL -> timestamp
           * transition may submit an iPOS MINUS.
           * Retries reconcile the immutable marker only.
           */
          const attempt =
            await firstAttempt(row);

          row = attempt.row;

          if (attempt.sendAllowed) {
            await updateMemberPoint({
            phone:
              row.sender_user_id,

            type_change:
              "MINUS",

            point_change:
              points,

            note,
          });

          }

          const postflight =
            await findIposMarker(
              phone84,
              note
            );

          if (
            !postflight.success ||
            !postflight.found
          ) {
            throw new Error(
              "game_gift_postflight:" +
              (
                postflight.error ||
                "marker_not_found"
              )
            );
          }
        }

        await markSynced(
          row
        );

        stats.success += 1;
      } catch (error) {
        try {
          await markFailed(
            row,
            error.message
          );
        } catch (
          stateError
        ) {
          throw new Error(
            "game_gift_delivery_state_unknown:" +
            stateError.message
          );
        }

        stats.failed += 1;
      }
    }

    return {
      success: true,
      stats,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error.message,
    };
  } finally {
    running = false;

    if (lockOwned) {
      await redisClient.eval(
        `
          if redis.call("GET", KEYS[1]) == ARGV[1]
          then
            return redis.call("DEL", KEYS[1])
          end
          return 0
        `,
        1,
        LOCK_KEY,
        token
      ).catch(() => {});
    }
  }
}

/*
 * CING_GAME_GIFT_IPOS_SCHEDULER_V1
 *
 * Explicit opt-in only.
 *
 * The existing queue owns financial delivery,
 * Redis lock, retry and reconciliation.
 * This scheduler only supplies bounded wakeups.
 */
const GIFT_IPOS_FIRST_RUN_MS =
  45 * 1000;

const GIFT_IPOS_INTERVAL_MS =
  60 * 1000;

let giftIposWakeTimer = null;
let giftIposIntervalTimer = null;

function runGiftIposScheduledCycle() {
  Promise.resolve()
    .then(() =>
      processCingGameGiftIposSyncQueue({
        batchSize: 10,
      })
    )
    .then(result => {
      if (
        result?.success === false
      ) {
        console.warn(
          "[CING GIFT IPOS] queue cycle failed"
        );
      }
    })
    .catch(() => {
      console.warn(
        "[CING GIFT IPOS] queue cycle failed"
      );
    });
}

function startCingGameGiftIposSyncWorker() {
  /*
   * OFF means no timer, queue, DB or iPOS call.
   * server.js also skips importing this module.
   */
  if (
    process.env[ENABLE_FLAG] !==
    "true"
  ) {
    return false;
  }

  if (
    giftIposWakeTimer !== null ||
    giftIposIntervalTimer !== null
  ) {
    return false;
  }

  giftIposWakeTimer = setTimeout(
    () => {
      giftIposWakeTimer = null;
      runGiftIposScheduledCycle();
    },
    GIFT_IPOS_FIRST_RUN_MS
  );

  giftIposIntervalTimer = setInterval(
    runGiftIposScheduledCycle,
    GIFT_IPOS_INTERVAL_MS
  );

  giftIposWakeTimer.unref?.();
  giftIposIntervalTimer.unref?.();

  return true;
}

module.exports = {
  buildIposNote,
  normalizeIposPhone,
  pointsOf,
  findIposMarker,
  processCingGameGiftIposSyncQueue,
  startCingGameGiftIposSyncWorker,
};
