const analytics = {

  sent: 0,

  failed: 0,

  retried: 0,

};

function trackNotificationSent() {

  analytics.sent +=
    1;

}

function trackNotificationFailed() {

  analytics.failed +=
    1;

}

function trackNotificationRetried() {

  analytics.retried +=
    1;

}

function getNotificationAnalytics() {

  return {

    ...analytics,

  };

}

module.exports = {

  trackNotificationSent,

  trackNotificationFailed,

  trackNotificationRetried,

  getNotificationAnalytics,

};