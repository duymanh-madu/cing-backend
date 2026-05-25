const auditTimeline =
  [];

/**
 * =====================================================
 * WRITE AUDIT EVENT
 * =====================================================
 */

function writeAuditEvent({

  actor_id,

  actor_role,

  action,

  resource,

  metadata,

}) {

  auditTimeline.unshift({

    actor_id,

    actor_role,

    action,

    resource,

    metadata:
      metadata || {},

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET AUDIT TIMELINE
 * =====================================================
 */

function getAuditTimeline() {

  return auditTimeline;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  writeAuditEvent,

  getAuditTimeline,

};