const processedEvents =
  new Set();

/**
 * =====================================================
 * GENERATE EVENT KEY
 * =====================================================
 */

function generateEventKey({

  type,

  payload,

}) {

  return JSON.stringify({

    type,

    payload,

  });

}

/**
 * =====================================================
 * CHECK DUPLICATE
 * =====================================================
 */

function isDuplicateEvent(
  event
) {

  const key =
    generateEventKey(
      event
    );

  return processedEvents.has(
    key
  );

}

/**
 * =====================================================
 * MARK PROCESSED
 * =====================================================
 */

function markEventProcessed(
  event
) {

  const key =
    generateEventKey(
      event
    );

  processedEvents.add(
    key
  );

}

/**
 * =====================================================
 * RESET GUARANTEE STORE
 * =====================================================
 */

function resetProcessedEvents() {

  processedEvents.clear();

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  isDuplicateEvent,

  markEventProcessed,

  resetProcessedEvents,

};