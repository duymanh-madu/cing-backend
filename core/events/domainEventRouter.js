const domainEventBus =
  require(
    "./domainEventBus"
  );

const {

  storeReplayEvent,

} = require(
  "./domainEventReplayService"
);

const {

  writeEventAudit,

} = require(
  "./domainEventAuditService"
);

/**
 * =====================================================
 * ROUTE DOMAIN EVENT
 * =====================================================
 */

async function routeDomainEvent({

  type,

  payload,

  source,

}) {

  const started =
    Date.now();

  try {

    /**
     * ===============================================
     * REPLAY STORAGE
     * ===============================================
     */

    storeReplayEvent({

      type,

      payload,

    });

    /**
     * ===============================================
     * EMIT
     * ===============================================
     */

    domainEventBus.emitEvent({

      type,

      payload,

    });

    /**
     * ===============================================
     * AUDIT
     * ===============================================
     */

    writeEventAudit({

      type,

      payload,

      source,

      status:
        "success",

      latency:
        Date.now() -
        started,

    });

  } catch (error) {

    writeEventAudit({

      type,

      payload,

      source,

      status:
        "failed",

      latency:
        Date.now() -
        started,

    });

    throw error;

  }

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  routeDomainEvent,

};