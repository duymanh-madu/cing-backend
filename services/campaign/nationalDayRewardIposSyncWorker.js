const { randomUUID } = require("crypto");
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

function nationalDayLookupWindow(page) {
  return {
    page,
    page_size: 100,
    create_from: "2026-08-15 00:00:00",
    // Keep marker discovery valid for durable retries that may
    // complete after the customer-facing campaign window closes.
    create_to: "2030-01-01 00:00:00",
  };
}

async function findNationalDayRewardMarker(
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
        nationalDayLookupWindow(page)
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

function processingLeaseIso() {
  return new Date(
    Date.now() + 10 * 60 * 1000
  ).toISOString();
}

async function claimPendingClaimById(claimId) {
  const eligibleAt = nowIso();

  const { data: locked, error } =
    await supabase
      .from("campaign_reward_claims")
      .update({
        ipos_sync_status: "processing",
        ipos_locked_until: processingLeaseIso(),
        updated_at: nowIso(),
      })
      .eq("id", claimId)
      .eq("reward_code", "national_day_2026_login_29")
      .eq("ipos_sync_status", "pending")
      .lte("ipos_next_retry_at", eligibleAt)
      .select("*");

  if (error) {
    throw new Error(error.message);
  }

  return locked?.[0] || null;
}

async function claimPendingClaims(
  limit = DEFAULT_BATCH_SIZE
) {
  const { data: pending, error } = await supabase
    .from("campaign_reward_claims")
    .select("id")
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

  const locked = [];

  for (const row of pending) {
    const claim =
      await claimPendingClaimById(row.id);

    if (claim) {
      locked.push(claim);
    }
  }

  return locked;
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
    .eq("id", claim.id)
    .eq("ipos_sync_status", "processing")
    .eq("ipos_locked_until", claim.ipos_locked_until);

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
    .eq("id", claim.id)
    .eq("ipos_sync_status", "processing")
    .eq("ipos_locked_until", claim.ipos_locked_until);

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

async function deliverClaimToIpos(claim) {
  try {
    const phone =
      claim.phone_normalized ||
      claim.user_id;

    const iposNote =
      buildIposRewardNote(claim.id);

    const digits =
      String(phone).replace(/\D/g, "");

    const userId84 =
      digits.startsWith("84")
        ? digits
        : "84" + digits.slice(1);

    const existingIposLog =
      await findNationalDayRewardMarker(
        userId84,
        iposNote
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
        await findNationalDayRewardMarker(
          userId84,
          iposNote
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

    return {
      success: true,
      claimId: claim.id,
    };
  } catch (error) {
    await markFailedAttempt(
      claim,
      error.message
    );

    return {
      success: false,
      claimId: claim.id,
      error: error.message,
    };
  }
}

async function processNationalDayRewardIposClaim(
  claimId
) {
  if (!claimId) {
    return {
      success: false,
      error: "claim_id_required",
    };
  }

  const claim =
    await claimPendingClaimById(claimId);

  if (!claim) {
    return {
      success: true,
      skipped: true,
      reason: "claim_not_pending",
      claimId,
    };
  }

  return deliverClaimToIpos(claim);
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

  const redisLockToken =
    randomUUID();

  let ownsRedisLock = false;

  try {
    const locked = await redisClient
      .set(
        redisLockKey,
        redisLockToken,
        "NX",
        "EX",
        240
      )
      .catch(() => null);

    ownsRedisLock =
      !!locked;

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
      const result =
        await deliverClaimToIpos(claim);

      if (result.success) {
        stats.success++;
      } else {
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

    if (ownsRedisLock) {
      await redisClient
        .eval(
          [
            "if redis.call('get', KEYS[1]) == ARGV[1] then",
            "  return redis.call('del', KEYS[1])",
            "end",
            "return 0",
          ].join("\n"),
          1,
          redisLockKey,
          redisLockToken
        )
        .catch(() => {});
    }
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
  processNationalDayRewardIposClaim,
  processNationalDayRewardIposSyncQueue,
  startNationalDayRewardIposSyncWorker,
};
