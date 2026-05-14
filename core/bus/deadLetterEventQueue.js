const deadEvents = [];

/**
 * =====================================================
 * PUSH DEAD EVENT
 * =====================================================
 */

function pushDeadEvent({

  event,

  payload,

  error,

}) {

  deadEvents.push({

    event,

    payload,

    error:

      error.message,

    timestamp:
      new Date().toISOString(),

  });

}

/**
 * =====================================================
 * GET DEAD EVENTS
 * =====================================================
 */

function getDeadEvents() {

  return deadEvents;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  pushDeadEvent,

  getDeadEvents,

};