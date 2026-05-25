const {

  enqueueNotification,

} = require(
  "./notificationQueueService"
);

const {

  dispatchNotification,

} = require(
  "./notificationDispatcher"
);

const {

  isCooldownActive,

  activateCooldown,

} = require(
  "./notificationCooldownService"
);

const {

  trackNotificationSent,

} = require(
  "./notificationAnalyticsService"
);

async function sendNotification({

  io,

  userId,

  room,

  event,

  payload,

  cooldownSeconds = 30,

}) {

  const cooldown =
    isCooldownActive({

      userId,

      event,

      cooldownSeconds,

    });

  if (cooldown) {

    return false;

  }

  activateCooldown({

    userId,

    event,

  });

  enqueueNotification({

    userId,

    event,

    payload,

  });

  await dispatchNotification({

    io,

    room,

    event,

    payload,

  });

  trackNotificationSent();

  return true;

}

module.exports = {

  sendNotification,

};