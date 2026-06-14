/**
 * =====================================================
 * WORKERS
 * =====================================================
 */

const notificationWorker =
  require(
    "../workers/notificationWorker"
  );

const socketCleanupWorker =
  require(
    "../workers/socketCleanupWorker"
  );

const voucherSchedulerWorker =
  require(
    "../workers/voucherSchedulerWorker"
  );

/**
 * =====================================================
 * INITIALIZE WORKERS
 * =====================================================
 */

async function initializeWorkers() {

  console.log(
    "[WORKER] Initializing workers..."
  );

  /**
   * =====================================================
   * NOTIFICATION
   * =====================================================
   */

  if (
    typeof notificationWorker ===
    "function"
  ) {

    await notificationWorker();

  }

  /**
   * =====================================================
   * SOCKET CLEANUP
   * =====================================================
   */

  if (
    typeof socketCleanupWorker ===
    "function"
  ) {

    await socketCleanupWorker();

  }

  /**
   * =====================================================
   * VOUCHER SCHEDULER
   * =====================================================
   */

  if (
    typeof voucherSchedulerWorker ===
    "function"
  ) {

    await voucherSchedulerWorker();

  }

  console.log(
    "[WORKER] Workers initialized"
  );

}

module.exports = {

  initializeWorkers,

};