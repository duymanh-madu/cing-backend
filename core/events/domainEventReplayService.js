const replayEvents =
  [];

/**
 * =====================================================
 * STORE REPLAY EVENT
 * =====================================================
 */

function storeReplayEvent({

  type,

  payload,

}) {

  replayEvents.push({

    type,

    payload,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET REPLAY EVENTS
 * =====================================================
 */

function getReplayEvents() {

  return replayEvents;

}

/**
 * =====================================================
 * CLEAR REPLAY EVENTS
 * =====================================================
 */

function clearReplayEvents() {

  replayEvents.length =
    0;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  storeReplayEvent,

  getReplayEvents,

  clearReplayEvents,

};