function shouldRetryEvent({

  retryCount,

  maxRetries = 3,

}) {

  return retryCount < maxRetries;

}

function getRetryDelay(

  retryCount

) {

  return retryCount * 1000;

}

module.exports = {

  shouldRetryEvent,

  getRetryDelay,

};