const registry =
  new Map();

/**
 * =====================================================
 * REGISTER EVENT
 * =====================================================
 */

function registerDomainEvent({

  type,

  owner,

  description,

}) {

  registry.set(

    type,

    {

      type,

      owner,

      description,

      registered_at:
        Date.now(),

    }

  );

}

/**
 * =====================================================
 * GET EVENTS
 * =====================================================
 */

function getRegisteredEvents() {

  return Array.from(
    registry.values()
  );

}

/**
 * =====================================================
 * CHECK EVENT
 * =====================================================
 */

function hasRegisteredEvent(
  type
) {

  return registry.has(
    type
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  registerDomainEvent,

  getRegisteredEvents,

  hasRegisteredEvent,

};