const supabase =
  require(
    "../../../../supabase"
  );

const redisClient =
  require(
    "../../../infrastructure/cache/redisClient"
  );

const {
  checkAndNotifyTop1Changes,
} = require(
  "../../../leaderboardResetService"
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
  "cing_block_puzzle_submit_top1_worker";

const DEFAULT_INTERVAL_MS =
  Number(
    process.env
      .CING_BLOCK_PUZZLE_SUBMIT_TOP1_INTERVAL_MS ||
    30 * 1000
  );

const MAX_RETRIES = 6;

let timer = null;
let running = false;

function nowIso() {
  return new Date()
    .toISOString();
}

function nextRetryIso(
  attemptCount
) {
  const scheduleSeconds = [
    10,
    30,
    120,
    600,
    1800,
  ];

  const seconds =
    scheduleSeconds[
      Math.min(
        Math.max(
          attemptCount - 1,
          0
        ),
        scheduleSeconds.length - 1
      )
    ] || 1800;

  return new Date(
    Date.now() +
      seconds * 1000
  ).toISOString();
}

async function
releaseStuckEffects() {
  const {
    error,
  } = await supabase
    .from(
      "cing_block_puzzle_submit_effects"
    )
    .update({
      status:
        "pending",

      locked_until:
        null,

      updated_at:
        nowIso(),
    })
    .eq(
      "status",
      "processing"
    )
    .lt(
      "locked_until",
      nowIso()
    );

  if (error) {
    throw error;
  }
}

async function
claimNextEffect() {
  const {
    data: pending,
    error,
  } = await supabase
    .from(
      "cing_block_puzzle_submit_effects"
    )
    .select("*")
    .eq(
      "status",
      "pending"
    )
    .lte(
      "next_attempt_at",
      nowIso()
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    )
    .limit(1);

  if (error) {
    throw error;
  }

  const candidate =
    pending?.[0];

  if (!candidate) {
    return null;
  }

  const {
    data,
    error: lockError,
  } = await supabase
    .from(
      "cing_block_puzzle_submit_effects"
    )
    .update({
      status:
        "processing",

      locked_until:
        new Date(
          Date.now() +
            5 *
              60 *
              1000
        ).toISOString(),

      updated_at:
        nowIso(),
    })
    .eq(
      "session_id",
      candidate.session_id
    )
    .eq(
      "status",
      "pending"
    )
    .select("*")
    .maybeSingle();

  if (lockError) {
    throw lockError;
  }

  return data || null;
}

async function
markDelivered(
  effect
) {
  const timestamp =
    nowIso();

  const {
    error,
  } = await supabase
    .from(
      "cing_block_puzzle_submit_effects"
    )
    .update({
      status:
        "delivered",

      delivered_at:
        timestamp,

      locked_until:
        null,

      last_error:
        null,

      updated_at:
        timestamp,
    })
    .eq(
      "session_id",
      effect.session_id
    );

  if (error) {
    throw error;
  }
}

async function
markFailedAttempt(
  effect,
  errorMessage
) {
  const attemptCount =
    Number(
      effect.attempt_count ||
        0
    ) + 1;

  const terminal =
    attemptCount >=
    MAX_RETRIES;

  const status =
    terminal
      ? "failed"
      : "pending";

  const {
    error,
  } = await supabase
    .from(
      "cing_block_puzzle_submit_effects"
    )
    .update({
      status,

      attempt_count:
        attemptCount,

      next_attempt_at:
        terminal
          ? nowIso()
          : nextRetryIso(
              attemptCount
            ),

      locked_until:
        null,

      last_error:
        String(
          errorMessage || ""
        ),

      updated_at:
        nowIso(),
    })
    .eq(
      "session_id",
      effect.session_id
    );

  if (error) {
    throw error;
  }

  if (terminal) {
    await sendAdminAlert({
      title:
        "🔴 Block Puzzle Top1 worker thất bại",

      message:
        `Session ${effect.session_id} không thể xử lý Top1 ` +
        `sau ${attemptCount} lần. Lỗi cuối: ${errorMessage}`,

      source:
        "cing_block_puzzle_submit_top1_worker_failed",
    }).catch(
      () => {}
    );
  }
}

async function
processCingBlockPuzzleSubmitTop1Queue() {
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
    "cing:block-puzzle:submit:top1:lock";

  try {
    const locked =
      await redisClient
        .set(
          redisLockKey,
          "1",
          "NX",
          "EX",
          120
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

    await releaseStuckEffects();

    const effect =
      await claimNextEffect();

    const stats = {
      total:
        effect ? 1 : 0,

      success: 0,
      failed: 0,
    };

    if (!effect) {
      return {
        success: true,
        stats,
      };
    }

    try {
      const io =
        global._ioInstance ||
        global.io;

      if (!io) {
        throw new Error(
          "top1_io_unavailable"
        );
      }

      await checkAndNotifyTop1Changes(
        io,
        {
          throwOnError: true,
        }
      );

      await markDelivered(
        effect
      );

      stats.success += 1;
    } catch (error) {
      await markFailedAttempt(
        effect,
        error.message
      );

      stats.failed += 1;
    }

    return {
      success: true,
      stats,
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
wakeCingBlockPuzzleSubmitTop1Worker() {
  setImmediate(() => {
    processCingBlockPuzzleSubmitTop1Queue()
      .catch(
        () => {}
      );
  });
}

function
startCingBlockPuzzleSubmitTop1Worker() {
  if (
    process.env
      .CING_BLOCK_PUZZLE_SUBMIT_TOP1_WORKER_ENABLED ===
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
      "Cing Block Puzzle Submit Top1 Worker",

    interval_ms:
      DEFAULT_INTERVAL_MS,

    type:
      "worker",
  });

  markSchedulerStarted(
    WORKER_KEY
  );

  setTimeout(() => {
    processCingBlockPuzzleSubmitTop1Queue()
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
  }, 15 * 1000);

  timer =
    setInterval(() => {
      processCingBlockPuzzleSubmitTop1Queue()
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
  processCingBlockPuzzleSubmitTop1Queue,
  wakeCingBlockPuzzleSubmitTop1Worker,
  startCingBlockPuzzleSubmitTop1Worker,
};
