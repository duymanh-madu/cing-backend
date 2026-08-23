const supabase =
  require("../../../../supabase");

const redisClient =
  require(
    "../../../infrastructure/cache/redisClient"
  );

const {
  updateMemberPoint,
  findMembershipLogByNote,
} = require(
  "../../../foodbook"
);

const {
  sendAdminAlert,
} = require(
  "../../../alerts/adminAlertService"
);

const {
  registerScheduler,
  markSchedulerStarted,
  markSchedulerSuccess,
  markSchedulerError,
} = require(
  "../../../scheduler/schedulerHealthService"
);

const WORKER_KEY =
  "cing_block_puzzle_continue_ipos_sync_worker";

const DEFAULT_INTERVAL_MS =
  Number(
    process.env
      .CING_BLOCK_PUZZLE_CONTINUE_IPOS_SYNC_INTERVAL_MS ||
      60 * 1000
  );

const DEFAULT_BATCH_SIZE =
  Number(
    process.env
      .CING_BLOCK_PUZZLE_CONTINUE_IPOS_SYNC_BATCH_SIZE ||
      10
  );

const MAX_RETRIES = 6;

let timer = null;
let running = false;

function nowIso() {
  return new Date()
    .toISOString();
}

function nextRetryIso(
  retryCount
) {
  const scheduleMinutes = [
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
      minutes *
        60 *
        1000
  ).toISOString();
}

function buildIposNote(
  purchaseId
) {
  return (
    `CING-BP-CONTINUE-${purchaseId}`
  );
}

function normalizeIposPhone(
  value
) {
  const digits =
    String(value || "")
      .replace(/\D/g, "");

  if (!digits) {
    throw new Error(
      "continue_ipos_phone_missing"
    );
  }

  return digits.startsWith("84")
    ? digits
    : "84" +
        digits.slice(1);
}

function formatIposDateTime(
  value
) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }
    ).formatToParts(
      date
    );

  const map =
    Object.fromEntries(
      parts.map(
        part => [
          part.type,
          part.value,
        ]
      )
    );

  return (
    `${map.year}-${map.month}-${map.day} ` +
    `${map.hour}:${map.minute}:${map.second}`
  );
}

function searchWindow(
  purchase
) {
  const first =
    new Date(
      purchase
        .ipos_first_attempt_at ||
      purchase.created_at
    );

  const from =
    new Date(
      first.getTime() -
        24 *
          60 *
          60 *
          1000
    );

  const to =
    new Date(
      Date.now() +
        24 *
          60 *
          60 *
          1000
    );

  return {
    create_from:
      formatIposDateTime(
        from
      ),

    create_to:
      formatIposDateTime(
        to
      ),
  };
}

async function
releaseStuckPurchases() {
  const {
    error,
  } = await supabase
    .from(
      "cing_block_puzzle_continue_purchases"
    )
    .update({
      ipos_sync_status:
        "pending",

      ipos_locked_until:
        null,

      updated_at:
        nowIso(),
    })
    .eq(
      "ipos_sync_status",
      "processing"
    )
    .lt(
      "ipos_locked_until",
      nowIso()
    );

  if (error) {
    throw error;
  }
}

async function
claimPendingPurchases(
  limit =
    DEFAULT_BATCH_SIZE
) {
  const {
    data: pending,
    error,
  } = await supabase
    .from(
      "cing_block_puzzle_continue_purchases"
    )
    .select("*")
    .eq(
      "ipos_sync_status",
      "pending"
    )
    .lte(
      "ipos_next_retry_at",
      nowIso()
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    )
    .limit(limit);

  if (error) {
    throw error;
  }

  if (!pending?.length) {
    return [];
  }

  const ids =
    pending.map(
      row => row.id
    );

  const {
    data: locked,
    error: lockError,
  } = await supabase
    .from(
      "cing_block_puzzle_continue_purchases"
    )
    .update({
      ipos_sync_status:
        "processing",

      ipos_locked_until:
        new Date(
          Date.now() +
            10 *
              60 *
              1000
        ).toISOString(),

      updated_at:
        nowIso(),
    })
    .in(
      "id",
      ids
    )
    .eq(
      "ipos_sync_status",
      "pending"
    )
    .select("*");

  if (lockError) {
    throw lockError;
  }

  return locked || [];
}

async function
ensureFirstAttempt(
  purchase
) {
  if (
    purchase
      .ipos_first_attempt_at
  ) {
    return purchase;
  }

  const firstAttempt =
    nowIso();

  const {
    data,
    error,
  } = await supabase
    .from(
      "cing_block_puzzle_continue_purchases"
    )
    .update({
      ipos_first_attempt_at:
        firstAttempt,

      updated_at:
        firstAttempt,
    })
    .eq(
      "id",
      purchase.id
    )
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (
    data || {
      ...purchase,
      ipos_first_attempt_at:
        firstAttempt,
    }
  );
}

async function
markSynced(
  purchase
) {
  const timestamp =
    nowIso();

  const {
    error,
  } = await supabase
    .from(
      "cing_block_puzzle_continue_purchases"
    )
    .update({
      ipos_sync_status:
        "synced",

      ipos_synced_at:
        timestamp,

      ipos_locked_until:
        null,

      ipos_last_error:
        null,

      updated_at:
        timestamp,
    })
    .eq(
      "id",
      purchase.id
    );

  if (error) {
    throw error;
  }
}

async function
markFailedAttempt(
  purchase,
  errorMessage
) {
  const retryCount =
    Number(
      purchase
        .ipos_retry_count ||
      0
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
  } = await supabase
    .from(
      "cing_block_puzzle_continue_purchases"
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

      updated_at:
        nowIso(),
    })
    .eq(
      "id",
      purchase.id
    );

  if (error) {
    throw error;
  }

  if (terminal) {
    await sendAdminAlert({
      title:
        "🔴 Đồng bộ điểm Continue sang iPOS thất bại",

      message:
        `Purchase ${purchase.id} của ${purchase.user_id} ` +
        `không thể đồng bộ -${purchase.points_cost} điểm ` +
        `sang iPOS sau ${retryCount} lần. ` +
        `Lỗi cuối: ${errorMessage}`,

      source:
        "cing_block_puzzle_continue_ipos_sync_failed",
    }).catch(() => {});
  }
}

async function
processCingBlockPuzzleContinueIposSyncQueue({
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
    "cing:block-puzzle:continue:ipos-sync:lock";

  try {
    const locked =
      await redisClient
        .set(
          redisLockKey,
          "1",
          "NX",
          "EX",
          240
        )
        .catch(
          () => null
        );

    if (!locked) {
      return {
        success: true,
        skipped: true,
        reason:
          "lock_exists",
      };
    }

    await releaseStuckPurchases();

    const purchases =
      await claimPendingPurchases(
        batchSize
      );

    const stats = {
      total:
        purchases.length,

      success: 0,
      failed: 0,
    };

    for (
      const rawPurchase
      of purchases
    ) {
      let purchase =
        rawPurchase;

      try {
        purchase =
          await ensureFirstAttempt(
            purchase
          );

        const phone84 =
          normalizeIposPhone(
            purchase.user_id
          );

        const note =
          buildIposNote(
            purchase.id
          );

        const window =
          searchWindow(
            purchase
          );

        const preflight =
          await findMembershipLogByNote(
            phone84,
            note,
            {
              page: 1,
              page_size: 100,
              ...window,
            }
          );

        if (
          !preflight.success
        ) {
          throw new Error(
            `continue_ipos_preflight:${preflight.error || "lookup_failed"}`
          );
        }

        if (
          !preflight.found
        ) {
          await updateMemberPoint({
            phone:
              purchase.user_id,

            type_change:
              "MINUS",

            point_change:
              Number(
                purchase.points_cost
              ),

            note,
          });

          const postflight =
            await findMembershipLogByNote(
              phone84,
              note,
              {
                page: 1,
                page_size: 100,
                ...window,
              }
            );

          if (
            !postflight.success
          ) {
            throw new Error(
              `continue_ipos_postflight:${postflight.error || "lookup_failed"}`
            );
          }

          if (
            !postflight.found
          ) {
            throw new Error(
              "continue_ipos_postflight:marker_not_found"
            );
          }
        }

        await markSynced(
          purchase
        );

        stats.success += 1;
      } catch (error) {
        await markFailedAttempt(
          purchase,
          error.message
        );

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

    await redisClient
      .del(
        redisLockKey
      )
      .catch(
        () => {}
      );
  }
}

function
wakeCingBlockPuzzleContinueIposSyncWorker() {
  setImmediate(() => {
    processCingBlockPuzzleContinueIposSyncQueue({
      batchSize: 1,
    }).catch(
      () => {}
    );
  });
}

function
startCingBlockPuzzleContinueIposSyncWorker() {
  if (
    process.env
      .CING_BLOCK_PUZZLE_CONTINUE_IPOS_SYNC_WORKER_ENABLED ===
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
      "Cing Block Puzzle Continue iPOS Sync Worker",

    interval_ms:
      DEFAULT_INTERVAL_MS,

    type:
      "worker",
  });

  markSchedulerStarted(
    WORKER_KEY
  );

  setTimeout(() => {
    processCingBlockPuzzleContinueIposSyncQueue()
      .then(result => {
        markSchedulerSuccess(
          WORKER_KEY,
          result?.stats ||
            result ||
            {}
        );
      })
      .catch(error => {
        markSchedulerError(
          WORKER_KEY,
          error
        );
      });
  }, 45 * 1000);

  timer =
    setInterval(() => {
      processCingBlockPuzzleContinueIposSyncQueue()
        .then(result => {
          markSchedulerSuccess(
            WORKER_KEY,
            result?.stats ||
              result ||
              {}
          );
        })
        .catch(error => {
          markSchedulerError(
            WORKER_KEY,
            error
          );
        });
    }, DEFAULT_INTERVAL_MS);
}

module.exports = {
  buildIposNote,
  processCingBlockPuzzleContinueIposSyncQueue,
  wakeCingBlockPuzzleContinueIposSyncWorker,
  startCingBlockPuzzleContinueIposSyncWorker,
};
