function calculateHealthGrade({

  memoryUsage,

  activeRequests,

}) {

  /**
   * ============================================
   * MEMORY
   * ============================================
   */

  const memoryMB =

    memoryUsage.heapUsed /

    1024 /

    1024;

  /**
   * ============================================
   * UNHEALTHY
   * ============================================
   */

  if (

    memoryMB > 1000 ||

    activeRequests > 1000

  ) {

    return "unhealthy";

  }

  /**
   * ============================================
   * DEGRADED
   * ============================================
   */

  if (

    memoryMB > 500 ||

    activeRequests > 300

  ) {

    return "degraded";

  }

  /**
   * ============================================
   * HEALTHY
   * ============================================
   */

  return "healthy";

}

module.exports = {

  calculateHealthGrade,

};