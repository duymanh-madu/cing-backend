const operationalLogs =
  [];

/**
 * =====================================================
 * EXECUTE OPERATION
 * =====================================================
 */

function executeOperationalAutomation({

  type,

  payload,

}) {

  operationalLogs.unshift({

    type,

    payload,

    executed_at:
      Date.now(),

  });

  return {

    success: true,

    type,

  };

}

/**
 * =====================================================
 * GET OPERATION LOGS
 * =====================================================
 */

function getOperationalLogs() {

  return operationalLogs;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  executeOperationalAutomation,

  getOperationalLogs,

};