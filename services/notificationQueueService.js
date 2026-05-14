const supabase =
  require("../supabase");

const {
  moveToDeadQueue,
} = require(
  "./deadLetterQueueService"
);

/**
 * ============================================
 * ENQUEUE JOB
 * ============================================
 */

async function enqueueNotificationJob({

  notification_id,

  job_type = "realtime",

  delivery_channel = "realtime",

  priority = "normal",

  scheduled_at = null,

}) {

  const {

    data,

    error,

  } = await supabase

    .from("notification_jobs")

    .insert({

      notification_id,

      job_type,

      delivery_channel,

      priority,

      scheduled_at,

      job_status: "pending",

      retry_count: 0,

    })

    .select()

    .single();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

/**
 * ============================================
 * GET PENDING JOBS
 * ============================================
 */

async function getPendingJobs({

  limit = 10,

} = {}) {

  const now =
    new Date().toISOString();

  const {

    data,

    error,

  } = await supabase

    .from("notification_jobs")

    .select("*")

    .eq(
      "job_status",
      "pending"
    )

    .or(

      `locked_until.is.null,locked_until.lt.${now}`

    )

    .order(
      "priority",
      {
        ascending: false,
      }
    )

    .order(
      "id",
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

  return data || [];

}

/**
 * ============================================
 * LOCK JOB
 * ============================================
 */

async function lockJob(

  job_id,

  worker_id

) {

  const locked_until =
    new Date(

      Date.now() + 30000

    ).toISOString();

  const {

    data,

    error,

  } = await supabase

    .from("notification_jobs")

    .update({

      job_status:
        "processing",

      worker_id,

      locked_until,

    })

    .eq(
      "id",
      job_id
    )

    .or(

      `locked_until.is.null,locked_until.lt.${new Date().toISOString()}`

    )

    .select()

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

/**
 * ============================================
 * COMPLETE JOB
 * ============================================
 */

async function completeJob(
  job_id
) {

  const {

    data,

    error,

  } = await supabase

    .from("notification_jobs")

    .update({

      job_status:
        "completed",

      processed_at:
        new Date(),

      locked_until:
        null,

    })

    .eq(
      "id",
      job_id
    )

    .select()

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

/**
 * ============================================
 * FAIL JOB
 * ============================================
 */

async function failJob({

  job_id,

  failed_reason,

}) {

  /**
   * GET CURRENT
   */

  const {

    data: currentJob,

    error:
      currentError,

  } = await supabase

    .from("notification_jobs")

    .select("*")

    .eq(
      "id",
      job_id
    )

    .maybeSingle();

  if (currentError) {

    throw new Error(
      currentError.message
    );

  }

  if (!currentJob) {

    return null;

  }

  /**
   * RETRY LIMIT
   */

  const retry_count =

    (currentJob.retry_count || 0) + 1;

  const maxRetry = 5;

  /**
   * FAILED
   */

  if (
    retry_count >=
    maxRetry
  ) {

    const {

      data,

      error,

    } = await supabase

      .from(
        "notification_jobs"
      )

      .update({

        job_status:
          "failed",

        retry_count,

        failed_reason,

        processed_at:
          new Date(),

        locked_until:
          null,

      })

      .eq(
        "id",
        job_id
      )

      .select()

      .maybeSingle();

    if (error) {

      throw new Error(
        error.message
      );

    }

await moveToDeadQueue({

  job:

    currentJob,

  failed_reason,

});

    return data;

  }

  /**
   * RETRY
   */

  const nextRetry =
    new Date(

      Date.now() +
        retry_count *
          15000

    ).toISOString();

  const {

    data,

    error,

  } = await supabase

    .from("notification_jobs")

    .update({

      job_status:
        "pending",

      retry_count,

      failed_reason,

      scheduled_at:
        nextRetry,

      worker_id:
        null,

      locked_until:
        null,

    })

    .eq(
      "id",
      job_id
    )

    .select()

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

/**
 * ============================================
 * RELEASE STUCK JOBS
 * ============================================
 */

async function releaseStuckJobs() {

  const now =
    new Date().toISOString();

  const {

    error,

  } = await supabase

    .from("notification_jobs")

    .update({

      job_status:
        "pending",

      worker_id:
        null,

      locked_until:
        null,

    })

    .eq(
      "job_status",
      "processing"
    )

    .lt(
      "locked_until",
      now
    );

  if (error) {

    throw new Error(
      error.message
    );

  }

}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {

  enqueueNotificationJob,

  getPendingJobs,

  lockJob,

  completeJob,

  failJob,

  releaseStuckJobs,

};