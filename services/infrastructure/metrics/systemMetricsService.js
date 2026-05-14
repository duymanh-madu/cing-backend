const os =
  require("os");

/**
 * =====================================================
 * GET SYSTEM METRICS
 * =====================================================
 */

function getSystemMetrics() {

  return {

    platform:
      os.platform(),

    architecture:
      os.arch(),

    cpu_count:
      os.cpus().length,

    total_memory:
      os.totalmem(),

    free_memory:
      os.freemem(),

    uptime:
      os.uptime(),

    load_average:
      os.loadavg(),

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  getSystemMetrics,

};