const distributedAuditLogs =
  [];

/**
 * =====================================================
 * CREATE AUDIT LOG
 * =====================================================
 */

function createAuditLog({

  actor,

  action,

  resource,

  metadata = {},

}) {

  distributedAuditLogs.unshift({

    actor,

    action,

    resource,

    metadata,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET AUDIT LOGS
 * =====================================================
 */

function getAuditLogs() {

  return distributedAuditLogs;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  createAuditLog,

  getAuditLogs,

};