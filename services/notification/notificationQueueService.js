const notificationQueue =
  [];

function enqueueNotification(
  notification
) {

  notificationQueue.push(
    notification
  );

}

function dequeueNotification() {

  return notificationQueue.shift();

}

function getNotificationQueueSize() {

  return notificationQueue.length;

}

module.exports = {

  enqueueNotification,

  dequeueNotification,

  getNotificationQueueSize,

};