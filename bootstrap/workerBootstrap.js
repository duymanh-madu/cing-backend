const {

  startWorker,

} = require(
  "../workers/notificationWorker"
);

const {

  startVoucherWorker,

} = require(
  "../workers/voucherSchedulerWorker"
);

const {

  startSocketCleanupWorker,

} = require(
  "../workers/socketCleanupWorker"
);

const {

  registerWorker,

} = require(
  "../services/infrastructure/metrics/workerMetricsService"
);

const logger =
  require(
    "../services/infrastructure/logger/logger"
  );

/**
 * =====================================================
 * BOOTSTRAP SINGLE WORKER
 * =====================================================
 */

async function bootstrapWorker({

  name,

  handler,

}) {

  try {

    await handler();

    registerWorker(
      name
    );

    logger.info(

      `${name} booted`

    );

    return {

      name,

      status:
        "running",

    };

  } catch (error) {

    logger.error(

      `${name} bootstrap failed`,

      {

        error:
          error.message,

        stack:
          error.stack,

      }

    );

    return {

      name,

      status:
        "failed",

      error:
        error.message,

    };

  }

}

/**
 * =====================================================
 * INITIALIZE WORKERS
 * =====================================================
 */

async function initializeWorkers() {

  /**
   * ============================================
   * BOOT ALL WORKERS IN PARALLEL
   * ============================================
   */

  const workers =
    await Promise.all([

      bootstrapWorker({

        name:
          "notification_worker",

        handler:
          startWorker,

      }),

      bootstrapWorker({

        name:
          "voucher_worker",

        handler:
          startVoucherWorker,

      }),

      bootstrapWorker({

        name:
          "socket_cleanup_worker",

        handler:
          async () => {

            startSocketCleanupWorker();

          },

      }),

    ]);

  /**
   * ============================================
   * WORKER SNAPSHOT
   * ============================================
   */

  logger.info(

    "All workers initialized",

    {

      total:
        workers.length,

      workers,

    }

  );

  return workers;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  initializeWorkers,

};