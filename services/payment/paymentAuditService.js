const auditLogs = [];

function appendPaymentAuditLog({
  action,
  actor,
  transaction_code,
  metadata,
}) {

  auditLogs.unshift({

    id:
      `${Date.now()}`,

    action,

    actor,

    transaction_code,

    metadata:
      metadata || {},

    created_at:
      new Date().toISOString(),

  });

}

function getPaymentAuditLogs() {

  return auditLogs;

}

module.exports = {

  appendPaymentAuditLog,

  getPaymentAuditLogs,

};