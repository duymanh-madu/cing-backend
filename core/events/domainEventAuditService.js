const auditEvents =
  [];

/**
 * =====================================================
 * WRITE EVENT AUDIT
 * =====================================================
 */

function writeEventAudit({

  type,

  payload,

  status,

  latency,

  source,

}) {

  auditEvents.unshift({

    type,

    payload,

    status,

    latency,

    source,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET EVENT AUDITS
 * =====================================================
 */

function getEventAudits() {

  return auditEvents;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  writeEventAudit,

  getEventAudits,

};