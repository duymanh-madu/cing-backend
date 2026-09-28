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
  "cing_points_revive_credit_purchases";

const LOCK_KEY =
  "cing:revive:points:ipos-sync:lock";

const ENABLE_FLAG =
  "CING_POINTS_REVIVE_IPOS_SYNC_WORKER_ENABLED";

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
      "points_revive_purchase_id_invalid"
    );
  }

  return `CING-REVIVE-POINTS-${id}`;
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
    "points_revive_ipos_phone_invalid"
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
      "points_revive_ipos_points_invalid"
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

/* Only narrow SECURITY DEFINER queue RPCs may change financial delivery state. */
const QUEUE_RPC = "cing_points_revive_ipos_queue_transition_v1";
const LOCK_TTL_SECONDS = 2400;

async function transition(action, { id = null, claimToken, reason = null, batchSize = 10 } = {}) {
  const { data, error } = await supabase.rpc(QUEUE_RPC, {
    p_action: action,
    p_purchase_id: id,
    p_claim_token: claimToken,
    p_failure: reason,
    p_batch_size: batchSize,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("points_revive_queue_receipt_invalid");
  return data;
}

async function claimPendingRows(batchSize, claimToken) {
  return transition("claim", { batchSize, claimToken });
}

async function firstAttempt(row) {
  const rows = await transition("start", {
    id: row.id,
    claimToken: row.ipos_claim_token,
  });
  if (rows.length !== 1) throw new Error("points_revive_first_attempt_unconfirmed");
  return rows[0];
}

async function assertClaimOwned(row) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id,ipos_sync_status,ipos_claim_token,ipos_locked_until")
    .eq("id", row.id)
    .maybeSingle();
  if (
    error || !data ||
    data.ipos_sync_status !== "processing" ||
    data.ipos_claim_token !== row.ipos_claim_token ||
    !data.ipos_locked_until ||
    Date.parse(data.ipos_locked_until) <= Date.now() + 120000
  ) {
    throw new Error("points_revive_claim_lost_or_expiring");
  }
}

async function markSynced(row) {
  const rows = await transition("synced", {
    id: row.id,
    claimToken: row.ipos_claim_token,
  });
  if (rows.length !== 1) throw new Error("points_revive_mark_synced_failed");
}

async function markFailed(row, reason) {
  const rows = await transition("failed", {
    id: row.id,
    claimToken: row.ipos_claim_token,
    reason: String(reason || "").slice(0, 1000),
  });
  if (rows.length !== 1) throw new Error("points_revive_mark_failed_failed");
  const count = rows[0].ipos_retry_count;
  if (rows[0].ipos_sync_status === "failed") {
    await sendAdminAlert({
      title: "Đồng bộ điểm mua Revive Credit thất bại",
      message: `Purchase ${row.id} / ${row.user_id}: -${row.total_points} điểm, ${count} attempts. ${reason}`,
      source: "cing_points_revive_ipos_sync_failed",
    }).catch(() => {});
  }
}

/*
 * Explicitly OFF unless activated in an authorized
 * release. Scheduler lives in a separate default-OFF module.
 */
async function
processCingPointsReviveIposSyncQueue({
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
      "points_revive_batch_size_invalid"
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
        LOCK_TTL_SECONDS
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

    const rows =
      await claimPendingRows(
        batchSize, token
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
            row.total_points
          );

        row =
          await firstAttempt(
            row
          );

        const phone84 =
          normalizeIposPhone(
            row.user_id
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
            "points_revive_preflight:" +
            preflight.error
          );
        }

        if (!preflight.found) {
          await assertClaimOwned(row);
          await updateMemberPoint({
            phone:
              row.user_id,

            type_change:
              "MINUS",

            point_change:
              points,

            note,
          });

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
              "points_revive_postflight:" +
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
            "points_revive_delivery_state_unknown:" +
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

module.exports = {
  buildIposNote,
  normalizeIposPhone,
  pointsOf,
  findIposMarker,
  processCingPointsReviveIposSyncQueue,
};
