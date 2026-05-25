const commerceQueues = {

  payment_sync: [],

  crm_sync: [],

  loyalty_sync: [],

  delivery_sync: [],

};

/**
 * =====================================================
 * PUSH QUEUE JOB
 * =====================================================
 */

function pushCommerceQueueJob({

  queue,

  payload,

}) {

  if (
    !commerceQueues[
      queue
    ]
  ) {

    throw new Error(
      "Queue not found"
    );

  }

  commerceQueues[
    queue
  ].push({

    payload,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET QUEUE
 * =====================================================
 */

function getCommerceQueue(
  queue
) {

  return (
    commerceQueues[
      queue
    ] || []
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  pushCommerceQueueJob,

  getCommerceQueue,

};