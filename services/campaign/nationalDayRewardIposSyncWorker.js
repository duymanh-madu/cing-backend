const supabase = require("../../supabase");
const redisClient = require("../infrastructure/cache/redisClient");
const {
  updateMemberPoint,
  findMembershipLogByNote,
} = require("../foodbook");
const { sendAdminAlert } = require("../alerts/adminAlertService");
const {
  registerScheduler,
  markSchedulerStarted,
  markSchedulerSuccess,
  markSchedulerError,
} = require("../scheduler/schedulerHealthService");

function buildIposRewardNote(claimId) {
  return `CING-ND2026-${claimId}`;
}


const WORKER_KEY =
  "national_day_reward_ipos_sync_worker";

const DEFAULT_INTERVAL_MS =
  Number(
    process.env.NATIONAL_DAY_REWARD_IPOS_SYNC_INTERVAL_MS ||
    5 * 60 * 1000
  );

const DEFAULT_BATCH_SIZE =
  Number(
    process.env.NATIONAL_DAY_REWARD_IPOS_SYNC_BATCH_SIZE ||
    10
  );

const MAX_RETRIES = 6;

let timer = null;
let running = false;

function nowIso() {
  return new Date().toISOString();
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

async function releaseStuckClaims() {
  const { error } = await supabase
    .from("campaign_reward_claims")
    .update({
      ipos_sync_status: "pending",
      ipos_locked_until: null,
      updated_at: nowIso(),
    })
    .eq("reward_code", "national_day_2026_login_29")
    .eq("ipos_sync_status", "processing")
    .lt("ipos_locked_until", nowIso());

  if (error) {
    throw new Error(
      `release_stuck_campaign_claims:${error.message}`
    );
  }
}

async function claimPendingClaims(
  limit = DEFAULT_BATCH_SIZE
) {
  const { data: pending, error } = await supabase
    .from("campaign_reward_claims")
    .select("*")
    .eq("reward_code", "national_day_2026_login_29")
    .eq("ipos_sync_status", "pending")
    .lte("ipos_next_retry_at", nowIso())
    .order("claimed_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  if (!pending?.length) {
    return [];
  }

  const ids = pending.map(row => row.id);

  const { data: locked, error: lockError } =
    await supabase
      .from("campaign_reward_claims")
      .update({
        ipos_sync_status: "processing",
        ipos_locked_until:
          new Date(
            Date.now() + 10 * 60 * 1000
          ).toISOString(),
        updated_at: nowIso(),
      })
      .in("id", ids)
      .eq("ipos_sync_status", "pending")
      .select("*");

  if (lockError) {
    throw new Error(lockError.message);
  }

  return locked || [];
}

async function markSynced(claim) {
  const { error } = await supabase
    .from("campaign_reward_claims")
    .update({
      ipos_sync_status: "synced",
      ipos_synced_at: nowIso(),
      ipos_locked_until: null,
      ipos_last_error: null,
      updated_at: nowIso(),
    })
    .eq("id", claim.id);

  if (error) {
    throw new Error(error.message);
  }
}

async function markFailedAttempt(
  claim,
  errorMessage
) {
  const retryCount =
    Number(claim.ipos_retry_count || 0) + 1;

  const terminal =
    retryCount >= MAX_RETRIES;

  const status =
    terminal ? "failed" : "pending";

  const { error } = await supabase
    .from("campaign_reward_claims")
    .update({
      ipos_sync_status: status,
      ipos_retry_count: retryCount,
      ipos_last_error: String(errorMessage || ""),
      ipos_next_retry_at:
        terminal
          ? nowIso()
          : nextRetryIso(retryCount),
      ipos_locked_until: null,
      updated_at: nowIso(),
    })
    .eq("id", claim.id);

  if (error) {
    throw new Error(error.message);
  }

  if (terminal) {
    await sendAdminAlert({
      title:
        "🔴 Đồng bộ điểm Quốc khánh sang iPOS thất bại",
      message:
        `Claim ${claim.id} của ${claim.user_id} ` +
        `không thể đồng bộ +${claim.reward_amount} điểm ` +
        `sang iPOS sau ${retryCount} lần. ` +
        `Lỗi cuối: ${errorMessage}`,
      source:
        "national_day_reward_ipos_sync_failed",
    }).catch(() => {});
  }
}

async function processNationalDayRewardIposSyncQueue({
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
    "campaign:national-day-2026:ipos-sync:lock";

  try {
    const locked = await redisClient
      .set(
        redisLockKey,
        "1",
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

    await releaseStuckClaims();

    const claims =
      await claimPendingClaims(batchSize);

    const stats = {
      total: claims.length,
      success: 0,
      failed: 0,
    };

    for (const claim of claims) {
      try {
        const phone =
          claim.phone_normalized ||
          claim.user_id;

        const iposNote =
          buildIposRewardNote(claim.id);

        const userId84 =
          String(phone).replace(/\D/g, "").startsWith("84")
            ? String(phone).replace(/\D/g, "")
            : "84" + String(phone).replace(/\D/g, "").slice(1);

        const existingIposLog =
          await findMembershipLogByNote(
            userId84,
            iposNote,
            {
              page: 1,
              page_size: 100,
              create_from: "2026-08-15 00:00:00",
              create_to: "2026-10-01 00:00:00",
            }
          );

        if (!existingIposLog.success) {
          throw new Error(
            `campaign_ipos_preflight:${existingIposLog.error || "lookup_failed"}`
          );
        }

        if (!existingIposLog.found) {
          await updateMemberPoint({
            phone,
            type_change: "ADD",
            point_change:
              Number(claim.reward_amount || 0),
            note: iposNote,
          });

          const verifiedIposLog =
            await findMembershipLogByNote(
              userId84,
              iposNote,
              {
                page: 1,
                page_size: 100,
                create_from: "2026-08-15 00:00:00",
                create_to: "2026-10-01 00:00:00",
              }
            );

          if (!verifiedIposLog.success) {
            throw new Error(
              `campaign_ipos_postflight:${verifiedIposLog.error || "lookup_failed"}`
            );
          }

          if (!verifiedIposLog.found) {
            throw new Error(
              "campaign_ipos_postflight:reward_marker_not_found"
            );
          }
        }

        await markSynced(claim);

        stats.success++;
      } catch (error) {
        await markFailedAttempt(
          claim,
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

    await redisClient
      .del(redisLockKey)
      .catch(() => {});
  }
}

function startNationalDayRewardIposSyncWorker() {
  if (
    process.env
      .NATIONAL_DAY_REWARD_IPOS_SYNC_WORKER_ENABLED ===
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
      "National Day Reward iPOS Sync Worker",
    interval_ms: DEFAULT_INTERVAL_MS,
    type: "worker",
  });

  markSchedulerStarted(WORKER_KEY);

  setTimeout(() => {
    processNationalDayRewardIposSyncQueue()
      .then(result => {
        markSchedulerSuccess(
          WORKER_KEY,
          result?.stats || result || {}
        );
      })
      .catch(error => {
        markSchedulerError(
          WORKER_KEY,
          error
        );
      });
  }, 60 * 1000);

  timer = setInterval(() => {
    processNationalDayRewardIposSyncQueue()
      .then(result => {
        markSchedulerSuccess(
          WORKER_KEY,
          result?.stats || result || {}
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
  processNationalDayRewardIposSyncQueue,
  startNationalDayRewardIposSyncWorker,
};
