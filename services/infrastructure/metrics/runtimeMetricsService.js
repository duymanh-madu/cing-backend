/**
 * =====================================================
 * GET RUNTIME METRICS
 * =====================================================
 */

function getRuntimeMetrics() {

  return {

    pid:
      process.pid,

    node_version:
      process.version,

    uptime:
      process.uptime(),

    memory_usage:
      process.memoryUsage(),

    cpu_usage:
      process.cpuUsage(),

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  getRuntimeMetrics,

};