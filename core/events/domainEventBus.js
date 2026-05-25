const EventEmitter =
  require("events");

/**
 * =====================================================
 * DOMAIN EVENT BUS
 * =====================================================
 */

class DomainEventBus extends EventEmitter {

  emitEvent({

    type,

    payload,

  }) {

    this.emit(
      type,
      payload
    );

  }

  registerListener({

    type,

    listener,

  }) {

    this.on(
      type,
      listener
    );

  }

  removeListener({

    type,

    listener,

  }) {

    this.off(
      type,
      listener
    );

  }

}

/**
 * =====================================================
 * SINGLETON
 * =====================================================
 */

const domainEventBus =
  new DomainEventBus();

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  domainEventBus;