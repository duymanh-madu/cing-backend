const {

  routeDomainEvent,

} = require(
  "./domainEventRouter"
);

const logger =
  require(
    "../../services/loggerService"
  );

const pipelineQueue =
  [];

/**
 * =====================================================
 * PUSH EVENT
 * =====================================================
 */

function pushPipelineEvent({

  type,

  payload,

  source,

}) {

  pipelineQueue.push({

    type,

    payload,

    source,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * PROCESS PIPELINE
 * =====================================================
 */

async function processPipelineEvents() {

  while (
    pipelineQueue.length > 0
  ) {

    const event =
      pipelineQueue.shift();

    try {

      await routeDomainEvent(
        event
      );

    } catch (error) {

      logger.error(

        "[EVENT PIPELINE ERROR]",

        {

          type:
            event.type,

          message:
            error.message,

        }

      );

    }

  }

}

/**
 * =====================================================
 * GET QUEUE
 * =====================================================
 */

function getPipelineQueue() {

  return pipelineQueue;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  pushPipelineEvent,

  processPipelineEvents,

  getPipelineQueue,

};