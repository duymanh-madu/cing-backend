const { randomUUID } = require("node:crypto");
const supabase = require("../../supabase");
const redisClient =
  require("../infrastructure/cache/redisClient");
const {
  updateMemberPoint,
  findMembershipLogByNote,
} = require("../foodbook");
const {
  sendAdminAlert,
} = require("../alerts/adminAlertService");
const {
  registerScheduler,
  markSchedulerStarted,
  markSchedulerSuccess,
  markSchedulerError,
} = require("../scheduler/schedulerHealthService");

const WORKER_KEY =
  "pending_reward_ipos_sync_worker";

const DEFAULT_INTERVAL_MS =
  Number(
    process.env
      .PENDING_REWARD_IPOS_SYNC_INTERVAL_MS ||
    5 * 60 * 1000
  );

const DEFAULT_BATCH_SIZE =
  Number(
    process.env
      .PENDING_REWARD_IPOS_SYNC_BATCH_SIZE ||
    20
  );

const MAX_RETRIES = 6;

let timer = null;
let running = false;

function nowIso() {
  return new Date().toISOString();
}

function buildIposRewardNote(rewardId) {
  return `CING-REWARD-${rewardId}`;
}

function nextRetryIso(retryCount) {
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
        Math.max(retryCount - 1, 0),
        scheduleMinutes.length - 1
      )
    ] || 1440;

  return new Date(
    Date.now() + minutes * 60 * 1000
  ).toISOString();
}

function lookupWindow(page) {
  return {
    page,
    page_size: 100,
    create_from: "2026-01-01 00:00:00",
    create_to: "2030-01-01 00:00:00",
  };
}

/**
 * iPOS membership_log is paginated.
 *
 * A financial idempotency lookup must not assume the immutable
 * marker is still present on page 1. Scan bounded pages until:
 *
 * - the marker is found; or
 * - iPOS returns a short page, proving exhaustion.
 *
 * The hard page bound prevents an upstream API defect from
 * producing an infinite worker loop.
 */
async function findRewardMarker(
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
      Number(result.scanned_count || 0);

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

async function releaseStuckRewards() {
  const { error } = await supabase
    .from("pending_rewards")
    .update({
      ipos_sync_status: "pending",
      ipos_locked_until: null,
    })
    .eq("claimed", true)
    .is("campaign_claim_id", null)
    .eq("ipos_sync_status", "processing")
    .lt("ipos_locked_until", nowIso());

  if (error) {
    throw new Error(
      `release_stuck_pending_rewards:${error.message}`
    );
  }
}

async function claimPendingRewards(
  limit = DEFAULT_BATCH_SIZE
) {
  const { data: pending, error } =
    await supabase
      .from("pending_rewards")
      .select("*")
      .eq("claimed", true)
      .is("campaign_claim_id", null)
      .eq("ipos_sync_status", "pending")
      .lte("ipos_next_retry_at", nowIso())
      .order("claimed_at", {
        ascending: true,
      })
      .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  if (!pending?.length) {
    return [];
  }

  const ids =
    pending.map((row) => row.id);

  const { data: locked, error: lockError } =
    await supabase
      .from("pending_rewards")
      .update({
        ipos_sync_status: "processing",
        ipos_locked_until:
          new Date(
            Date.now() + 10 * 60 * 1000
          ).toISOString(),
      })
      .in("id", ids)
      .eq("claimed", true)
      .is("campaign_claim_id", null)
      .eq("ipos_sync_status", "pending")
      .select("*");

  if (lockError) {
    throw new Error(lockError.message);
  }

  return locked || [];
}

async function markSynced(reward) {
  const { error } = await supabase
    .from("pending_rewards")
    .update({
      ipos_sync_status: "synced",
      ipos_synced_at: nowIso(),
      ipos_locked_until: null,
      ipos_last_error: null,
    })
    .eq("id", reward.id)
    .eq("ipos_sync_status", "processing");

  if (error) {
    throw new Error(error.message);
  }
}

async function markFailedAttempt(
  reward,
  errorMessage
) {
  const retryCount =
    Number(
      reward.ipos_retry_count || 0
    ) + 1;

  const terminal =
    retryCount >= MAX_RETRIES;

  const status =
    terminal ? "failed" : "pending";

  const { error } = await supabase
    .from("pending_rewards")
    .update({
      ipos_sync_status: status,
      ipos_retry_count: retryCount,
      ipos_last_error:
        String(errorMessage || ""),
      ipos_next_retry_at:
        terminal
          ? nowIso()
          : nextRetryIso(retryCount),
      ipos_locked_until: null,
    })
    .eq("id", reward.id)
    .eq("ipos_sync_status", "processing");

  if (error) {
    throw new Error(error.message);
  }

  if (terminal) {
    await sendAdminAlert({
      title:
        "🔴 Đồng bộ điểm reward sang iPOS thất bại",
      message:
        `Reward ${reward.id} của ` +
        `${reward.user_id} không thể đồng bộ ` +
        `+${reward.points} điểm sang iPOS ` +
        `sau ${retryCount} lần. ` +
        `Lỗi cuối: ${errorMessage}`,
      source:
        "pending_reward_ipos_sync_failed",
    }).catch(() => {});
  }
}

async function processPendingRewardIposSyncQueue({
  batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
  if (running) {
    return {
      success: true,
      skipped: true,
      reason: "already_running",
    };
  }

  running = true;

  const redisLockKey =
    "rewards:pending:ipos-sync:lock";

  const redisLockToken =
    randomUUID();

  let redisLockOwned = false;

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
        reason: "lock_exists",
      };
    }

    redisLockOwned = true;

    await releaseStuckRewards();

    const rewards =
      await claimPendingRewards(batchSize);

    const stats = {
      total: rewards.length,
      success: 0,
      failed: 0,
    };

    for (const reward of rewards) {
      try {
        const phone =
          reward.user_id;

        const iposNote =
          buildIposRewardNote(
            reward.id
          );

        const digits =
          String(phone)
            .replace(/\D/g, "");

        const userId84 =
          digits.startsWith("84")
            ? digits
            : "84" + digits.slice(1);

        const existingIposLog =
          await findRewardMarker(
            userId84,
            iposNote
          );

        if (!existingIposLog.success) {
          throw new Error(
            `reward_ipos_preflight:${
              existingIposLog.error ||
              "lookup_failed"
            }`
          );
        }

        if (!existingIposLog.found) {
          await updateMemberPoint({
            phone,
            type_change: "ADD",
            point_change:
              Number(
                reward.points || 0
              ),
            note: iposNote,
          });

          const verifiedIposLog =
            await findRewardMarker(
              userId84,
              iposNote
            );

          if (!verifiedIposLog.success) {
            throw new Error(
              `reward_ipos_postflight:${
                verifiedIposLog.error ||
                "lookup_failed"
              }`
            );
          }

          if (!verifiedIposLog.found) {
            throw new Error(
              "reward_ipos_postflight:" +
              "reward_marker_not_found"
            );
          }
        }

        await markSynced(reward);
        stats.success++;
      } catch (error) {
        await markFailedAttempt(
          reward,
          error.message
        );

        stats.failed++;
      }
    }

    return {
      success: true,
      stats,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
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

function startPendingRewardIposSyncWorker() {
  if (
    process.env
      .PENDING_REWARD_IPOS_SYNC_WORKER_ENABLED ===
    "false"
  ) {
    return;
  }

  if (timer) {
    return;
  }

  registerScheduler({
    key: WORKER_KEY,
    name:
      "Pending Reward iPOS Sync Worker",
    interval_ms: DEFAULT_INTERVAL_MS,
    type: "worker",
  });

  markSchedulerStarted(WORKER_KEY);

  setTimeout(async () => {
    const result =
      await processPendingRewardIposSyncQueue();

    if (result.success) {
      markSchedulerSuccess(WORKER_KEY);
    } else {
      markSchedulerError(
        WORKER_KEY,
        result.error
      );
    }
  }, 15000);

  timer = setInterval(async () => {
    const result =
      await processPendingRewardIposSyncQueue();

    if (result.success) {
      markSchedulerSuccess(WORKER_KEY);
    } else {
      markSchedulerError(
        WORKER_KEY,
        result.error
      );
    }
  }, DEFAULT_INTERVAL_MS);
}

module.exports = {
  buildIposRewardNote,
  processPendingRewardIposSyncQueue,
  startPendingRewardIposSyncWorker,
};
