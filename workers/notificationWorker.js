const supabase =
  require("../supabase");

const {

  getPendingJobs,

  lockJob,

  completeJob,

  failJob,

  releaseStuckJobs,

} = require(

  "../services/notificationQueueService"

);

const {

  markProcessing,

  markDelivered,

  markFailed,

} = require(

  "../services/notificationDeliveryService"

);

/**
 * ============================================
 * WORKER ID
 * ============================================
 */

const WORKER_ID =

  `worker-${process.pid}`;

/**
 * ============================================
 * PROCESS JOB
 * ============================================
 */

async function processJob(
  job
) {

  try {

    /**
     * LOCK
     */

    const lockedJob =

      await lockJob(

        job.id,

        WORKER_ID

      );

    /**
     * LOCK FAILED
     */

    if (!lockedJob) {

      return;

    }

    /**
     * GET NOTIFICATION
     */

    const {

      data: notification,

      error,

    } = await supabase

      .from(
        "notifications"
      )

      .select("*")

      .eq(
        "id",
        job.notification_id
      )

      .maybeSingle();

    if (error) {

      throw new Error(
        error.message
      );

    }

    if (!notification) {

      throw new Error(
        "Notification not found"
      );

    }

    /**
     * MARK PROCESSING
     */

    await markProcessing(
      notification.id
    );

    /**
     * SOCKET
     */

    const io =
      global.io;

    /**
     * REALTIME
     */

    if (
      io &&
      job.delivery_channel ===
        "realtime"
    ) {

      io.to(

        `user:${notification.user_id}`

      ).emit(

        "notification",

        notification

      );

      console.log(

        `📨 Notification emitted to user:${notification.user_id}`

      );

    }

    /**
     * DELIVERED
     */

    await markDelivered(
      notification.id
    );

    /**
     * COMPLETE
     */

    await completeJob(
      job.id
    );

    console.log(

      `✅ Job completed: ${job.id}`

    );

  } catch (error) {

    console.error(

      `❌ Worker failed job ${job.id}:`,

      error.message

    );

    /**
     * FAIL
     */

    await failJob({

      job_id:
        job.id,

      failed_reason:
        error.message,

    });

    /**
     * DELIVERY FAIL
     */

    try {

      await markFailed(
        job.notification_id
      );

    } catch (err) {

      console.error(

        "markFailed error:",

        err.message

      );

    }

  }

}

/**
 * ============================================
 * START WORKER
 * ============================================
 */

async function startWorker() {

  console.log(

    `🚀 Notification worker started: ${WORKER_ID}`

  );

  /**
   * RELEASE STUCK
   */

  await releaseStuckJobs();

  /**
   * LOOP
   */

  setInterval(

    async () => {

      try {

        const jobs =

          await getPendingJobs({

            limit: 10,

          });

        if (
          jobs.length === 0
        ) {

          return;

        }

        console.log(

          `📦 Worker found ${jobs.length} jobs`

        );

        for (
          const job of jobs
        ) {

          await processJob(
            job
          );

        }

      } catch (error) {

        console.error(

          "Worker loop error:",

          error.message

        );

      }

    },

    3000
  );

}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {

  startWorker,

};