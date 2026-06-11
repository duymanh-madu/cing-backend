const supabase = require("../../supabase");
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
    const pong = await redisClient.ping();
    checks.redis = { status: pong === "PONG" ? "healthy" : "warning", detail: pong };
  } catch (e) {
    checks.redis = { status: "critical", detail: e.message };
  }

  try {
    const { error } = await supabase.from("crm_sync_queue").select("id").limit(1);
    checks.crm_recovery = { status: error ? "critical" : "healthy", detail: error?.message || "ok" };
  } catch (e) {
    checks.crm_recovery = { status: "critical", detail: e.message };
  }

  try {
    const { error } = await supabase.from("ipos_sync_queue").select("id").limit(1);
    checks.ipos_recovery = { status: error ? "critical" : "healthy", detail: error?.message || "ok" };
  } catch (e) {
    checks.ipos_recovery = { status: "critical", detail: e.message };
  }

  res.json({
    success: true,
    data: {
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
      supabase.from("notification_jobs").select("id,notification_id,created_at,scheduled_at").eq("job_status", "pending").order("created_at", { ascending:true }).limit(1).maybeSingle(),
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
      .order("created_at", { ascending:false })
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


module.exports = {
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
};
