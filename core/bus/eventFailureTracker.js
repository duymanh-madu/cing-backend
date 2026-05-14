const failures = [];

function trackEventFailure({

  event,

  error,

  payload,

}) {

  failures.push({

    event,

    error:
      error.message,

    payload,

    created_at:
      new Date(),

  });

}

function getEventFailures() {

  return failures;

}

module.exports = {

  trackEventFailure,

  getEventFailures,

};