const retryQueue = [];

function enqueueRetry(
  notification
) {

  retryQueue.push(
    notification
  );

}

function getRetryQueue() {

  return retryQueue;

}

module.exports = {

  enqueueRetry,

  getRetryQueue,

};