const supabase = require("../../supabase");
const {
  getSchedulerHealth,
} = require("../../services/scheduler/schedulerHealthService");

const {
  getTransactionIntegritySnapshot,
} = require("../../services/transaction/transactionIntegrityService");

const {
  getLoyaltyIntegritySnapshot,
} = require("../../services/loyalty/loyaltyIntegrityService");

const {
  runTransactionIntegrityCheck,
} = require("../../services/transaction/transactionIntegrityWorker");
const redisClient = require("../../services/infrastructure/cache/redisClient");
const {
  enqueueCrmSyncRecovery,
  processCrmSyncQueue,
} = require("../../services/crm/crmSyncRecoveryWorker");

const {
  processIposSyncQueue,
} = require("../../services/ipos/iposSyncRecoveryWorker");

const {
  releaseStuckJobs: releaseStuckNotificationJobs,
} = require("../../services/notificationQueueService");

const {
  getDeadJobs,
} = require("../../services/deadLetterQueueService");

async function getCrmRecoveryStats(req, res) {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [
      pending,
      processing,
      failed,
      doneToday,
      oldestPending,
      lastProcessed,
      recentFailed,
    ] = await Promise.all([
      supabase.from("crm_sync_queue").select("id", { count:"exact", head:true }).eq("status", "pending"),
      supabase.from("crm_sync_queue").select("id", { count:"exact", head:true }).eq("status", "processing"),
      supabase.from("crm_sync_queue").select("id", { count:"exact", head:true }).eq("status", "failed"),
      supabase.from("crm_sync_queue").select("id", { count:"exact", head:true }).eq("status", "done").gte("processed_at", today.toISOString()),
      supabase.from("crm_sync_queue").select("id,created_at,next_retry_at").eq("status", "pending").order("created_at", { ascending:true }).limit(1).maybeSingle(),
      supabase.from("crm_sync_queue").select("id,user_id,processed_at").eq("status", "done").order("processed_at", { ascending:false }).limit(1).maybeSingle(),
      supabase.from("crm_sync_queue").select("id,user_id,phone,source,retry_count,last_error,updated_at").eq("status", "failed").order("updated_at", { ascending:false }).limit(5),
    ]);

    const totalToday = Number(doneToday.count || 0) + Number(failed.count || 0);
    const successRate = totalToday > 0
      ? Math.round((Number(doneToday.count || 0) / totalToday) * 1000) / 10
      : 100;

    res.json({
      success: true,
      data: {
        pending: pending.count || 0,
        processing: processing.count || 0,
        failed: failed.count || 0,
        done_today: doneToday.count || 0,
        success_rate: successRate,
        oldest_pending: oldestPending.data || null,
        last_processed: lastProcessed.data || null,
        recent_failed: recentFailed.data || [],
      },
    });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function getCrmRecoveryJobs(req, res) {
  try {
    const {
      status = "",
      limit = 50,
      page = 1,
    } = req.query;

    const off = (Number(page) - 1) * Number(limit);

    let query = supabase
      .from("crm_sync_queue")
      .select("*", { count:"exact" })
      .order("created_at", { ascending:false })
      .range(off, off + Number(limit) - 1);

    if (status) query = query.eq("status", status);

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      total: count || 0,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function retryCrmRecoveryJob(req, res) {
  try {
    const { id } = req.params;

    const { data: job, error } = await supabase
      .from("crm_sync_queue")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !job) {
      return res.status(404).json({ success:false, message:"Không tìm thấy job" });
    }

    await supabase
      .from("crm_sync_queue")
      .update({
        status: "pending",
        retry_count: 0,
        last_error: null,
        next_retry_at: new Date().toISOString(),
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    res.json({ success:true, message:"Đã đưa job về hàng chờ retry" });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function retryAllFailedCrmRecovery(req, res) {
  try {
    const { data, error } = await supabase
      .from("crm_sync_queue")
      .update({
        status: "pending",
        retry_count: 0,
        last_error: null,
        next_retry_at: new Date().toISOString(),
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("status", "failed")
      .select("id");

    if (error) throw error;

    res.json({
      success: true,
      message: `Đã đưa ${data?.length || 0} job lỗi về hàng chờ`,
      count: data?.length || 0,
    });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function enqueueCrmRecoveryManual(req, res) {
  try {
    const { phone, user_id } = req.body || {};
    const result = await enqueueCrmSyncRecovery({
      user_id: user_id || phone,
      phone: phone || user_id,
      source: "admin_manual",
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function runCrmRecoveryWorkerNow(req, res) {
  try {
    const result = await processCrmSyncQueue({
      batchSize: Number(req.body?.batchSize || 5),
      staleLimit: Number(req.body?.staleLimit || 1),
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function cleanupCrmRecoveryDone(req, res) {
  try {
    const { data, error } = await supabase.rpc("cleanup_crm_sync_queue_done");
    if (error) throw error;

    res.json({
      success: true,
      deleted: data || 0,
    });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function getSystemHealth(req, res) {
  const checks = {};

  try {
    const { error } = await supabase
      .from("players")
      .select("user_id")
      .limit(1);

    checks.database = {
      status: error ? "critical" : "healthy",
      detail: error?.message || "ok",
    };
  } catch (e) {
    checks.database = { status: "critical", detail: e.message };
  }

  try {
    const { data: dbSize, error: dbErr } = await supabase.rpc("get_database_size");
    if (dbErr) throw new Error(dbErr.message);

    const PRO_LIMIT_GB = 8;
    const usedGB = Number(dbSize) / (1024 ** 3);
    const pct = (usedGB / PRO_LIMIT_GB) * 100;

    let status = "healthy";
    if (pct >= 90) status = "critical";
    else if (pct >= 70) status = "warning";

    checks.db_storage = {
      status,
      detail: usedGB.toFixed(2) + " GB / " + PRO_LIMIT_GB + " GB (" + pct.toFixed(1) + "%)",
      used_gb: Number(usedGB.toFixed(3)),
      limit_gb: PRO_LIMIT_GB,
      percent: Number(pct.toFixed(1)),
    };
  } catch (e) {
    checks.db_storage = { status: "warning", detail: e.message };
  }

  try {
    const axios = require("axios");
    const start = Date.now();
    const r = await axios.get("https://game.madu.com.vn/health", { timeout: 5000 });
    const latency = Date.now() - start;
    const d = r.data || {};

    let status = "healthy";
    if (!d.ok) status = "warning";
    else if (latency > 2000) status = "warning";

    const uptimeMin = d.uptime_seconds ? Math.round(d.uptime_seconds / 60) : null;
    const chessQ = d.chess?.queue ?? 0;
    const chessGames = d.chess?.active_games ?? 0;

    checks.game_server = {
      status,
      detail: d.ok
        ? `${latency}ms · uptime ${uptimeMin}m · ${d.memory_mb}MB · community ${d.community_users_online} · chess: ${chessQ} queue / ${chessGames} games`
        : "Unexpected response",
      games: d.games || [],
      latency_ms: latency,
      uptime_seconds: d.uptime_seconds,
      memory_mb: d.memory_mb,
      community_users_online: d.community_users_online,
      chess_queue: chessQ,
      chess_active_games: chessGames,
    };
  } catch (e) {
    checks.game_server = { status: "critical", detail: "Mắt Bão không phản hồi: " + e.message };
  }

  try {
    const pong = await redisClient.ping();

    checks.redis = {
      status: pong === "PONG" ? "healthy" : "warning",
      detail: pong,
    };
  } catch (e) {
    checks.redis = { status: "critical", detail: e.message };
  }

  try {
    const { error } = await supabase
      .from("crm_sync_queue")
      .select("id")
      .limit(1);

    checks.crm_recovery = {
      status: error ? "critical" : "healthy",
      detail: error?.message || "ok",
    };
  } catch (e) {
    checks.crm_recovery = { status: "critical", detail: e.message };
  }

  try {
    const { error } = await supabase
      .from("ipos_sync_queue")
      .select("id")
      .limit(1);

    checks.ipos_recovery = {
      status: error ? "critical" : "healthy",
      detail: error?.message || "ok",
    };
  } catch (e) {
    checks.ipos_recovery = { status: "critical", detail: e.message };
  }

  try {
    const { error } = await supabase
      .from("notification_jobs")
      .select("id")
      .limit(1);

    checks.notification_recovery = {
      status: error ? "critical" : "healthy",
      detail: error?.message || "ok",
    };
  } catch (e) {
    checks.notification_recovery = { status: "critical", detail: e.message };
  }

  try {
    const onlineUsers =
      global.onlineUsers instanceof Map
        ? global.onlineUsers.size
        : 0;

    checks.socket_runtime = {
      status: "healthy",
      detail: `${onlineUsers} online users`,
      online_users: onlineUsers,
    };
  } catch (e) {
    checks.socket_runtime = { status: "warning", detail: e.message };
  }

  try {
    const schedulerHealth = getSchedulerHealth();

    checks.scheduler_health = {
      status: schedulerHealth.status,
      detail: `${schedulerHealth.healthy}/${schedulerHealth.total} healthy`,
      ...schedulerHealth,
    };
  } catch (e) {
    checks.scheduler_health = { status: "warning", detail: e.message };
  }

  try {
    const txIntegrity = await getTransactionIntegritySnapshot({
      autoRecover: false,
      graceMinutes: Number(process.env.TRANSACTION_INTEGRITY_GRACE_MINUTES || 10),
    });

    checks.transaction_integrity = {
      status: txIntegrity.status,
      detail: `CRM missing ${txIntegrity.missing_crm}, iPOS missing ${txIntegrity.missing_ipos}`,
      ...txIntegrity,
    };
  } catch (e) {
    checks.transaction_integrity = { status: "warning", detail: e.message };
  }

  try {
  const loyaltyIntegrity =
    await getLoyaltyIntegritySnapshot();

  checks.loyalty_integrity = {
    status: loyaltyIntegrity.status,
    detail:
      `${loyaltyIntegrity.mismatch_users} mismatch / ${loyaltyIntegrity.checked_users} users`,
    ...loyaltyIntegrity,
  };
} catch (e) {
  checks.loyalty_integrity = {
    status: "warning",
    detail: e.message,
  };
}

  try {
    const { data: cfg } = await supabase.from("app_configs")
      .select("zalo_oa_token_expiry").eq("id", 1).single();

    const expiry = cfg?.zalo_oa_token_expiry ? new Date(cfg.zalo_oa_token_expiry) : null;
    const now = new Date();
    const hoursLeft = expiry ? (expiry - now) / (1000*60*60) : null;

    let status, detail;
    if (!expiry) {
      status = "critical"; detail = "Chưa có token hoặc chưa rõ hạn";
    } else if (hoursLeft <= 0) {
      status = "critical"; detail = "Token đã hết hạn — cần kết nối lại Zalo OA";
    } else if (hoursLeft < 4) {
      status = "warning"; detail = `Token còn ${hoursLeft.toFixed(1)}h — sắp hết hạn`;
    } else {
      status = "healthy"; detail = `Token còn ${hoursLeft.toFixed(1)}h`;
    }

    checks.zalo_oa = { status, detail, expiry: cfg?.zalo_oa_token_expiry || null };
  } catch (e) {
    checks.zalo_oa = { status: "warning", detail: e.message };
  }

  try {
    const now = new Date();
    const curHour = now.toISOString().slice(0,13);
    const prevHour = new Date(now.getTime() - 3600*1000).toISOString().slice(0,13);

    const [curCount, prevCount] = await Promise.all([
      redisClient.get(`ipos:dedup_skip:${curHour}`).catch(()=>null),
      redisClient.get(`ipos:dedup_skip:${prevHour}`).catch(()=>null),
    ]);

    const cur = Number(curCount || 0);
    const prev = Number(prevCount || 0);
    const total = cur + prev;

    // Threshold: >20 skip/2h là bất thường (mỗi giao dịch giờ unique, skip thật hiếm)
    const status = total > 50 ? "critical" : total > 20 ? "warning" : "healthy";

    checks.webhook_dedup = {
      status,
      detail: `${total} duplicate events bị skip trong 2h qua (giờ này: ${cur}, giờ trước: ${prev})`,
      skip_count_current_hour: cur,
      skip_count_prev_hour: prev,
    };
  } catch (e) {
    checks.webhook_dedup = { status: "warning", detail: e.message };
  }

  try {
    const fiveMinAgo = new Date(Date.now() - 5*60*1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60*60*1000).toISOString();

    const [{ count: pending }, { count: recentTotal }] = await Promise.all([
      supabase.from("ipos_webhook_log").select("*",{count:'exact',head:true}).eq("synced",false).not("phone","is",null),
      supabase.from("ipos_webhook_log").select("*",{count:'exact',head:true}).gte("received_at", oneHourAgo),
    ]);

    const p = pending || 0;
    const status = p > 10 ? "critical" : p > 3 ? "warning" : "healthy";

    checks.ipos_activity = {
      status,
      detail: `${p} giao dịch đang chờ sync, ${recentTotal||0} events trong 1h qua`,
      pending_sync: p,
      events_last_hour: recentTotal || 0,
    };
  } catch (e) {
    checks.ipos_activity = { status: "warning", detail: e.message };
  }


  const values = Object.values(checks);
  const critical = values.filter(v => v.status === "critical").length;
  const warning = values.filter(v => v.status === "warning").length;

  const overall_status =
    critical > 0 ? "critical" :
    warning > 0 ? "warning" :
    "healthy";

  res.json({
    success: true,
    data: {
      overall_status,
      checks,
      timestamp: new Date().toISOString(),
    },
  });
}


async function getIposRecoveryStats(req, res) {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [
      pending,
      processing,
      failed,
      doneToday,
      oldestPending,
      lastProcessed,
      recentFailed,
    ] = await Promise.all([
      supabase.from("ipos_sync_queue").select("id", { count:"exact", head:true }).eq("status", "pending"),
      supabase.from("ipos_sync_queue").select("id", { count:"exact", head:true }).eq("status", "processing"),
      supabase.from("ipos_sync_queue").select("id", { count:"exact", head:true }).eq("status", "failed"),
      supabase.from("ipos_sync_queue").select("id", { count:"exact", head:true }).eq("status", "done").gte("processed_at", today.toISOString()),
      supabase.from("ipos_sync_queue").select("id,order_id,created_at,next_retry_at").eq("status", "pending").order("created_at", { ascending:true }).limit(1).maybeSingle(),
      supabase.from("ipos_sync_queue").select("id,order_id,processed_at").eq("status", "done").order("processed_at", { ascending:false }).limit(1).maybeSingle(),
      supabase.from("ipos_sync_queue").select("id,order_id,transaction_code,retry_count,last_error,updated_at").eq("status", "failed").order("updated_at", { ascending:false }).limit(5),
    ]);

    const totalToday = Number(doneToday.count || 0) + Number(failed.count || 0);
    const successRate = totalToday > 0
      ? Math.round((Number(doneToday.count || 0) / totalToday) * 1000) / 10
      : 100;

    res.json({
      success: true,
      data: {
        pending: pending.count || 0,
        processing: processing.count || 0,
        failed: failed.count || 0,
        done_today: doneToday.count || 0,
        success_rate: successRate,
        oldest_pending: oldestPending.data || null,
        last_processed: lastProcessed.data || null,
        recent_failed: recentFailed.data || [],
      },
    });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function getIposRecoveryJobs(req, res) {
  try {
    const {
      status = "",
      limit = 50,
      page = 1,
    } = req.query;

    const off = (Number(page) - 1) * Number(limit);

    let query = supabase
      .from("ipos_sync_queue")
      .select("*", { count:"exact" })
      .order("created_at", { ascending:false })
      .range(off, off + Number(limit) - 1);

    if (status) query = query.eq("status", status);

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      total: count || 0,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function retryIposRecoveryJob(req, res) {
  try {
    const { id } = req.params;

    const { data: job, error } = await supabase
      .from("ipos_sync_queue")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !job) {
      return res.status(404).json({ success:false, message:"Không tìm thấy iPOS recovery job" });
    }

    await supabase
      .from("ipos_sync_queue")
      .update({
        status: "pending",
        retry_count: 0,
        last_error: null,
        next_retry_at: new Date().toISOString(),
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    res.json({ success:true, message:"Đã đưa iPOS job về hàng chờ retry" });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function retryAllFailedIposRecovery(req, res) {
  try {
    const { data, error } = await supabase
      .from("ipos_sync_queue")
      .update({
        status: "pending",
        retry_count: 0,
        last_error: null,
        next_retry_at: new Date().toISOString(),
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("status", "failed")
      .select("id");

    if (error) throw error;

    res.json({
      success: true,
      message: `Đã đưa ${data?.length || 0} iPOS job lỗi về hàng chờ`,
      count: data?.length || 0,
    });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function runIposRecoveryWorkerNow(req, res) {
  try {
    const result = await processIposSyncQueue({
      batchSize: Number(req.body?.batchSize || 3),
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}



async function getNotificationRecoveryStats(req, res) {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [
      pending,
      processing,
      failed,
      completedToday,
      oldestPending,
      lastProcessed,
      deadJobs,
    ] = await Promise.all([
      supabase.from("notification_jobs").select("id", { count:"exact", head:true }).eq("job_status", "pending"),
      supabase.from("notification_jobs").select("id", { count:"exact", head:true }).eq("job_status", "processing"),
      supabase.from("notification_jobs").select("id", { count:"exact", head:true }).eq("job_status", "failed"),
      supabase.from("notification_jobs").select("id", { count:"exact", head:true }).eq("job_status", "completed").gte("processed_at", today.toISOString()),
      supabase.from("notification_jobs").select("id,notification_id,scheduled_at").eq("job_status", "pending").order("scheduled_at", { ascending:true }).limit(1).maybeSingle(),
      supabase.from("notification_jobs").select("id,notification_id,processed_at").eq("job_status", "completed").order("processed_at", { ascending:false }).limit(1).maybeSingle(),
      supabase.from("notification_dead_jobs").select("id", { count:"exact", head:true }),
    ]);

    const totalToday = Number(completedToday.count || 0) + Number(failed.count || 0);
    const successRate = totalToday > 0
      ? Math.round((Number(completedToday.count || 0) / totalToday) * 1000) / 10
      : 100;

    res.json({
      success: true,
      data: {
        pending: pending.count || 0,
        processing: processing.count || 0,
        failed: failed.count || 0,
        completed_today: completedToday.count || 0,
        done_today: completedToday.count || 0,
        dead_jobs: deadJobs.count || 0,
        success_rate: successRate,
        oldest_pending: oldestPending.data || null,
        last_processed: lastProcessed.data || null,
      },
    });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function getNotificationRecoveryJobs(req, res) {
  try {
    const {
      status = "",
      limit = 50,
      page = 1,
    } = req.query;

    const off = (Number(page) - 1) * Number(limit);

    let query = supabase
      .from("notification_jobs")
      .select("*", { count:"exact" })
      .order("scheduled_at", { ascending:false })
      .range(off, off + Number(limit) - 1);

    if (status) query = query.eq("job_status", status);

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      total: count || 0,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function getNotificationDeadJobs(req, res) {
  try {
    const limit = Number(req.query.limit || 50);
    const jobs = await getDeadJobs({ limit });

    res.json({
      success: true,
      data: jobs,
      total: jobs.length,
    });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function retryNotificationJob(req, res) {
  try {
    const { id } = req.params;

    const { data: job, error } = await supabase
      .from("notification_jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !job) {
      return res.status(404).json({ success:false, message:"Không tìm thấy notification job" });
    }

    await supabase
      .from("notification_jobs")
      .update({
        job_status: "pending",
        retry_count: 0,
        failed_reason: null,
        scheduled_at: new Date().toISOString(),
        worker_id: null,
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    res.json({ success:true, message:"Đã đưa notification job về hàng chờ retry" });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function retryAllFailedNotificationJobs(req, res) {
  try {
    const { data, error } = await supabase
      .from("notification_jobs")
      .update({
        job_status: "pending",
        retry_count: 0,
        failed_reason: null,
        scheduled_at: new Date().toISOString(),
        worker_id: null,
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("job_status", "failed")
      .select("id");

    if (error) throw error;

    res.json({
      success: true,
      message: `Đã đưa ${data?.length || 0} notification job lỗi về hàng chờ`,
      count: data?.length || 0,
    });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function releaseStuckNotificationRecovery(req, res) {
  try {
    await releaseStuckNotificationJobs();
    res.json({ success:true, message:"Đã release stuck notification jobs" });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function cleanupCompletedNotificationJobs(req, res) {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("notification_jobs")
      .delete()
      .eq("job_status", "completed")
      .lt("processed_at", cutoff)
      .select("id");

    if (error) throw error;

    res.json({
      success: true,
      deleted: data?.length || 0,
    });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}



async function getTransactionIntegrityHealth(req, res) {
  try {
    const result = await getTransactionIntegritySnapshot({
      autoRecover: false,
      graceMinutes: Number(req.query.graceMinutes || process.env.TRANSACTION_INTEGRITY_GRACE_MINUTES || 10),
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function runTransactionIntegrityNow(req, res) {
  try {
    const result = await runTransactionIntegrityCheck();
    res.json(result);
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
}

async function getLoyaltyIntegrityHealth(req, res) {
  try {
    const result =
      await getLoyaltyIntegritySnapshot();

    res.json({
      success: true,
      data: result,
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message,
    });
  }
}

module.exports = {
  runTransactionIntegrityNow,
  getTransactionIntegrityHealth,
  cleanupCompletedNotificationJobs,
  releaseStuckNotificationRecovery,
  retryAllFailedNotificationJobs,
  retryNotificationJob,
  getNotificationDeadJobs,
  getNotificationRecoveryJobs,
  getNotificationRecoveryStats,
  runIposRecoveryWorkerNow,
  retryAllFailedIposRecovery,
  retryIposRecoveryJob,
  getIposRecoveryJobs,
  getIposRecoveryStats,
  getSystemHealth,
  getCrmRecoveryStats,
  getCrmRecoveryJobs,
  retryCrmRecoveryJob,
  retryAllFailedCrmRecovery,
  enqueueCrmRecoveryManual,
  runCrmRecoveryWorkerNow,
  cleanupCrmRecoveryDone,
  getLoyaltyIntegrityHealth,
};
