const deadQueue = [];

function pushDeadEvent({

  event,

  error,

}) {

  deadQueue.push({

    event,

    error:
      error.message,

    failed_at:
      new Date(),

  });

}

function getDeadEvents() {

  return deadQueue;

}

module.exports = {

  pushDeadEvent,

  getDeadEvents,

};