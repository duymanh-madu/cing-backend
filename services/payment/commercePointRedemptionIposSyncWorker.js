"use strict";

const {
  randomUUID,
} = require("node:crypto");

const supabase =
  require("../../supabase");

const redisClient =
  require(
    "../infrastructure/cache/redisClient"
  );

const {
  updateMemberPoint,
  findMembershipLogByNote,
} = require("../foodbook");

const {
  sendAdminAlert,
} = require(
  "../alerts/adminAlertService"
);

const {
  registerScheduler,
  markSchedulerStarted,
  markSchedulerSuccess,
  markSchedulerError,
} = require(
  "../scheduler/schedulerHealthService"
);


const WORKER_KEY =
  "commerce_point_redemption_ipos_sync_worker";

const DEFAULT_INTERVAL_MS =
  Number(
    process.env
      .COMMERCE_POINT_REDEMPTION_IPOS_SYNC_INTERVAL_MS ||
    60 * 1000
  );

const DEFAULT_BATCH_SIZE =
  Number(
    process.env
      .COMMERCE_POINT_REDEMPTION_IPOS_SYNC_BATCH_SIZE ||
    20
  );

const MAX_RETRIES = 6;

let timer = null;
let running = false;


function nowIso() {
  return new Date().toISOString();
}


function buildCommercePointRedemptionIposNote(
  paymentTransactionId
) {
  const id =
    Number(paymentTransactionId);

  if (
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    throw new Error(
      "commerce_point_redemption_payment_id_invalid"
    );
  }

  return (
    `CING-COMMERCE-POINTS-${id}`
  );
}


function nextRetryIso(
  retryCount
) {
  const scheduleMinutes = [
    1,
    5,
    15,
    60,
    360,
    1440,
  ];

  const minutes =
    scheduleMinutes[
      Math.min(
        Math.max(
          retryCount - 1,
          0
        ),
        scheduleMinutes.length - 1
      )
    ] || 1440;

  return new Date(
    Date.now() +
      minutes * 60 * 1000
  ).toISOString();
}


function lookupWindow(page) {
  return {
    page,
    page_size: 100,
    create_from:
      "2026-01-01 00:00:00",
    create_to:
      "2030-01-01 00:00:00",
  };
}


/*
 * Financial marker lookup.
 *
 * Never assume marker remains on page 1.
 */
async function
findCommercePointRedemptionMarker(
  userId84,
  iposNote
) {
  const MAX_PAGES = 100;

  for (
    let page = 1;
    page <= MAX_PAGES;
    page++
  ) {
    const result =
      await findMembershipLogByNote(
        userId84,
        iposNote,
        lookupWindow(page)
      );

    if (!result.success) {
      return result;
    }

    if (result.found) {
      return result;
    }

    const scannedCount =
      Number(
        result.scanned_count || 0
      );

    if (scannedCount < 100) {
      return {
        ...result,
        found: false,
      };
    }
  }

  return {
    success: false,
    found: false,
    data: null,
    error:
      "membership_log_pagination_limit_exceeded",
  };
}


async function recoverTerminalPointReservations({
  limit = 100,
} = {}) {
  /*
   * IMPORTANT CUTOVER FENCE
   *
   * Only not_ready rows are eligible here.
   *
   * Historical stale reservations were classified legacy_synced
   * by migration and MUST NOT be auto-released because an old CRM
   * snapshot may already have restored their balance.
   */
  const {
    data: reservations,
    error,
  } =
    await supabase
      .from(
        "commerce_point_reservations"
      )
      .select(
        "payment_transaction_id,user_id,points,status,ipos_sync_status,reserved_at"
      )
      .eq(
        "status",
        "reserved"
      )
      .eq(
        "ipos_sync_status",
        "not_ready"
      )
      .order(
        "reserved_at",
        {
          ascending: true,
        }
      )
      .limit(limit);

  if (error) {
    throw new Error(
      "commerce_point_expiry_scan:" +
      error.message
    );
  }

  if (!reservations?.length) {
    return {
      scanned: 0,
      eligible: 0,
      released: 0,
    };
  }


  const ids =
    reservations.map(
      row =>
        row.payment_transaction_id
    );


  const {
    data: payments,
    error: paymentError,
  } =
    await supabase
      .from(
        "payment_transactions"
      )
      .select(
        "id,payment_status,payment_purpose,expired_at,order_created,settlement_verified_at,settlement_consumed_at"
      )
      .in(
        "id",
        ids
      );

  if (paymentError) {
    throw new Error(
      "commerce_point_expiry_payment_scan:" +
      paymentError.message
    );
  }


  const paymentById =
    new Map(
      (payments || []).map(
        row => [
          Number(row.id),
          row,
        ]
      )
    );


  const now =
    Date.now();

  let eligible = 0;
  let released = 0;


  for (
    const reservation of
      reservations
  ) {
    const payment =
      paymentById.get(
        Number(
          reservation.payment_transaction_id
        )
      );

    if (!payment) {
      throw new Error(
        "commerce_point_expiry_payment_missing:" +
        reservation.payment_transaction_id
      );
    }


    /*
     * Node performs a cheap candidate filter only.
     *
     * PostgreSQL release authority remains final financial
     * authority and locks/re-validates payment + reservation +
     * player atomically.
     */
    const failed =
      payment.payment_status ===
        "failed";

    const expired =
      payment.payment_status ===
        "pending" &&
      payment.expired_at &&
      new Date(
        payment.expired_at
      ).getTime() <= now;


    if (
      !failed &&
      !expired
    ) {
      continue;
    }


    eligible++;


    const reason =
      failed
        ? "payment_failed_auto_recovery"
        : "payment_expired_auto_recovery";


    const {
      data: releaseData,
      error: releaseError,
    } =
      await supabase.rpc(
        "cing_commerce_release_payment_points_v1",
        {
          p_payment_transaction_id:
            reservation
              .payment_transaction_id,

          p_release_reason:
            reason,
        }
      );


    if (releaseError) {
      /*
       * Payment may have become paid concurrently after our read.
       *
       * The SQL authority correctly fails closed. Do not convert
       * that race into a balance mutation.
       */
      const message =
        String(
          releaseError.message ||
          ""
        );

      if (
        message.includes(
          "COMMERCE_POINT_RELEASE_PAYMENT_ALREADY_SETTLED"
        ) ||
        message.includes(
          "COMMERCE_POINT_RELEASE_PAYMENT_NOT_TERMINAL"
        ) ||
        message.includes(
          "COMMERCE_POINT_RELEASE_ALREADY_CONSUMED"
        )
      ) {
        continue;
      }

      throw new Error(
        "commerce_point_expiry_release:" +
        releaseError.message
      );
    }


    const row =
      Array.isArray(releaseData)
        ? releaseData[0]
        : releaseData;

    if (
      row?.reservation_status ===
        "released"
    ) {
      released++;
    }
  }


  return {
    scanned:
      reservations.length,

    eligible,

    released,
  };
}


async function releaseStuckRows() {
  const {
    error,
  } =
    await supabase
      .from(
        "commerce_point_reservations"
      )
      .update({
        ipos_sync_status:
          "pending",

        ipos_locked_until:
          null,

        ipos_updated_at:
          nowIso(),
      })
      .eq(
        "status",
        "consumed"
      )
      .eq(
        "ipos_sync_status",
        "processing"
      )
      .lt(
        "ipos_locked_until",
        nowIso()
      );

  if (error) {
    throw new Error(
      "release_stuck_commerce_point_redemptions:" +
      error.message
    );
  }
}


async function claimPendingRows(
  limit = DEFAULT_BATCH_SIZE
) {
  const {
    data: pending,
    error,
  } =
    await supabase
      .from(
        "commerce_point_reservations"
      )
      .select("*")
      .eq(
        "status",
        "consumed"
      )
      .eq(
        "ipos_sync_status",
        "pending"
      )
      .lte(
        "ipos_next_retry_at",
        nowIso()
      )
      .order(
        "consumed_at",
        {
          ascending: true,
        }
      )
      .limit(limit);

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (!pending?.length) {
    return [];
  }


  const ids =
    pending.map(
      row =>
        row.payment_transaction_id
    );


  /*
   * Compare-and-transition:
   * pending -> processing.
   *
   * Another worker that already won the row causes it to fall
   * out of this UPDATE predicate.
   */
  const {
    data: locked,
    error: lockError,
  } =
    await supabase
      .from(
        "commerce_point_reservations"
      )
      .update({
        ipos_sync_status:
          "processing",

        ipos_locked_until:
          new Date(
            Date.now() +
            10 * 60 * 1000
          ).toISOString(),

        ipos_updated_at:
          nowIso(),
      })
      .in(
        "payment_transaction_id",
        ids
      )
      .eq(
        "status",
        "consumed"
      )
      .eq(
        "ipos_sync_status",
        "pending"
      )
      .select("*");

  if (lockError) {
    throw new Error(
      lockError.message
    );
  }

  return locked || [];
}


async function markFirstAttemptIfMissing(
  row
) {
  const {
    error,
  } =
    await supabase
      .from(
        "commerce_point_reservations"
      )
      .update({
        ipos_first_attempt_at:
          nowIso(),

        ipos_updated_at:
          nowIso(),
      })
      .eq(
        "payment_transaction_id",
        row.payment_transaction_id
      )
      .eq(
        "status",
        "consumed"
      )
      .eq(
        "ipos_sync_status",
        "processing"
      )
      .is(
        "ipos_first_attempt_at",
        null
      );

  if (error) {
    throw new Error(
      "commerce_point_redemption_first_attempt:" +
      error.message
    );
  }
}


async function markSynced(
  row
) {
  const {
    error,
  } =
    await supabase
      .from(
        "commerce_point_reservations"
      )
      .update({
        ipos_sync_status:
          "synced",

        ipos_synced_at:
          nowIso(),

        ipos_locked_until:
          null,

        ipos_last_error:
          null,

        ipos_updated_at:
          nowIso(),
      })
      .eq(
        "payment_transaction_id",
        row.payment_transaction_id
      )
      .eq(
        "status",
        "consumed"
      )
      .eq(
        "ipos_sync_status",
        "processing"
      );

  if (error) {
    throw new Error(
      error.message
    );
  }
}


async function markFailedAttempt(
  row,
  errorMessage
) {
  const retryCount =
    Number(
      row.ipos_retry_count || 0
    ) + 1;

  const terminal =
    retryCount >=
      MAX_RETRIES;

  const status =
    terminal
      ? "failed"
      : "pending";

  const {
    error,
  } =
    await supabase
      .from(
        "commerce_point_reservations"
      )
      .update({
        ipos_sync_status:
          status,

        ipos_retry_count:
          retryCount,

        ipos_last_error:
          String(
            errorMessage || ""
          ),

        ipos_next_retry_at:
          terminal
            ? nowIso()
            : nextRetryIso(
                retryCount
              ),

        ipos_locked_until:
          null,

        ipos_updated_at:
          nowIso(),
      })
      .eq(
        "payment_transaction_id",
        row.payment_transaction_id
      )
      .eq(
        "status",
        "consumed"
      )
      .eq(
        "ipos_sync_status",
        "processing"
      );

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (terminal) {
    await sendAdminAlert({
      title:
        "🔴 Đồng bộ điểm thanh toán sang iPOS thất bại",

      message:
        `Payment ${row.payment_transaction_id} ` +
        `của ${row.user_id} không thể đồng bộ ` +
        `-${row.points} điểm sang iPOS ` +
        `sau ${retryCount} lần. ` +
        `Lỗi cuối: ${errorMessage}`,

      source:
        "commerce_point_redemption_ipos_sync_failed",
    }).catch(() => {});
  }
}


function normalizeIposUserId84(
  userId
) {
  const digits =
    String(userId || "")
      .replace(/\D/g, "");

  if (!digits) {
    throw new Error(
      "commerce_point_redemption_user_invalid"
    );
  }

  return digits.startsWith("84")
    ? digits
    : "84" + digits.slice(1);
}


async function
processCommercePointRedemptionIposSyncQueue({
  batchSize =
    DEFAULT_BATCH_SIZE,
} = {}) {

  if (running) {
    return {
      success: true,
      skipped: true,
      reason:
        "already_running",
    };
  }

  running = true;

  const redisLockKey =
    "commerce:points:ipos-sync:lock";

  const redisLockToken =
    randomUUID();

  let redisLockOwned =
    false;

  try {
    const locked =
      await redisClient
        .set(
          redisLockKey,
          redisLockToken,
          "NX",
          "EX",
          240
        )
        .catch(() => null);

    if (!locked) {
      return {
        success: true,
        skipped: true,
        reason:
          "lock_exists",
      };
    }

    redisLockOwned =
      true;


    const recovery =
      await recoverTerminalPointReservations();

    await releaseStuckRows();

    const rows =
      await claimPendingRows(
        batchSize
      );

    const stats = {
      total:
        rows.length,

      success:
        0,

      failed:
        0,
    };


    for (const row of rows) {
      try {
        const points =
          Number(
            row.points || 0
          );

        if (
          !Number.isSafeInteger(
            points
          ) ||
          points <= 0
        ) {
          throw new Error(
            "commerce_point_redemption_points_invalid"
          );
        }


        await markFirstAttemptIfMissing(
          row
        );


        const iposNote =
          buildCommercePointRedemptionIposNote(
            row.payment_transaction_id
          );

        const userId84 =
          normalizeIposUserId84(
            row.user_id
          );


        /*
         * PRE-FLIGHT:
         *
         * Crash may have happened after iPOS accepted MINUS but
         * before PostgreSQL status became synced.
         *
         * The immutable marker is authoritative for retry safety.
         */
        const preflight =
          await findCommercePointRedemptionMarker(
            userId84,
            iposNote
          );

        if (!preflight.success) {
          throw new Error(
            "commerce_point_redemption_ipos_preflight:" +
            (
              preflight.error ||
              "lookup_failed"
            )
          );
        }


        if (!preflight.found) {
          await updateMemberPoint({
            phone:
              row.user_id,

            type_change:
              "MINUS",

            point_change:
              points,

            note:
              iposNote,
          });


          /*
           * POST-FLIGHT:
           *
           * Never mark synced solely because HTTP returned.
           * Prove the immutable marker exists in iPOS history.
           */
          const postflight =
            await findCommercePointRedemptionMarker(
              userId84,
              iposNote
            );

          if (!postflight.success) {
            throw new Error(
              "commerce_point_redemption_ipos_postflight:" +
              (
                postflight.error ||
                "lookup_failed"
              )
            );
          }

          if (!postflight.found) {
            throw new Error(
              "commerce_point_redemption_ipos_postflight:" +
              "marker_not_found"
            );
          }
        }


        await markSynced(
          row
        );

        stats.success++;
      } catch (error) {
        await markFailedAttempt(
          row,
          error.message
        );

        stats.failed++;
      }
    }


    return {
      success: true,
      recovery,
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

    if (redisLockOwned) {
      await redisClient
        .eval(
          `
            if redis.call("GET", KEYS[1]) == ARGV[1]
            then
              return redis.call("DEL", KEYS[1])
            end
            return 0
          `,
          1,
          redisLockKey,
          redisLockToken
        )
        .catch(() => {});
    }
  }
}


function
startCommercePointRedemptionIposSyncWorker() {

  if (
    process.env
      .COMMERCE_POINT_REDEMPTION_IPOS_SYNC_WORKER_ENABLED ===
    "false"
  ) {
    return;
  }

  if (timer) {
    return;
  }


  registerScheduler({
    key:
      WORKER_KEY,

    name:
      "Commerce Point Redemption iPOS Sync Worker",

    interval_ms:
      DEFAULT_INTERVAL_MS,

    type:
      "worker",
  });


  markSchedulerStarted(
    WORKER_KEY
  );


  setTimeout(
    async () => {
      const result =
        await processCommercePointRedemptionIposSyncQueue();

      if (result.success) {
        markSchedulerSuccess(
          WORKER_KEY
        );
      } else {
        markSchedulerError(
          WORKER_KEY,
          result.error
        );
      }
    },
    15000
  );


  timer =
    setInterval(
      async () => {
        const result =
          await processCommercePointRedemptionIposSyncQueue();

        if (result.success) {
          markSchedulerSuccess(
            WORKER_KEY
          );
        } else {
          markSchedulerError(
            WORKER_KEY,
            result.error
          );
        }
      },
      DEFAULT_INTERVAL_MS
    );
}


module.exports = {
  buildCommercePointRedemptionIposNote,
  findCommercePointRedemptionMarker,
  recoverTerminalPointReservations,
  processCommercePointRedemptionIposSyncQueue,
  startCommercePointRedemptionIposSyncWorker,
};
