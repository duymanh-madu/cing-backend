const deadLetters = [];

function pushDeadPaymentEvent(
  payload
) {

  deadLetters.push({

    ...payload,

    failed_at:
      new Date().toISOString(),

  });

}

function getDeadPaymentEvents() {

  return deadLetters;

}

module.exports = {

  pushDeadPaymentEvent,

  getDeadPaymentEvents,

};