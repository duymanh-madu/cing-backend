const supabase =
  require("../supabase");

/**
 * ============================================
 * MOVE TO DEAD LETTER QUEUE
 * ============================================
 */

async function moveToDeadQueue({

  job,

  failed_reason,

}) {

  const {

    error,

  } = await supabase

    .from(
      "notification_dead_jobs"
    )

    .insert({

      original_job_id:
        job.id,

      notification_id:
        job.notification_id,

      job_type:
        job.job_type,

      delivery_channel:
        job.delivery_channel,

      priority:
        job.priority,

      retry_count:
        job.retry_count || 0,

      failed_reason,

      payload: job,

    });

  if (error) {

    throw new Error(
      error.message
    );

  }

}

/**
 * ============================================
 * GET DEAD JOBS
 * ============================================
 */

async function getDeadJobs({

  limit = 50,

} = {}) {

  const {

    data,

    error,

  } = await supabase

    .from(
      "notification_dead_jobs"
    )

    .select("*")

    .order(
      "id",
      {
        ascending: false,
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

module.exports = {

  moveToDeadQueue,

  getDeadJobs,

};