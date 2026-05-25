const notificationPolicies = {

  ENABLED:
    true,

  QUIET_HOURS: {

    enabled:
      false,

    start:
      "22:00",

    end:
      "07:00",

  },

  COOLDOWN_SECONDS:
    30,

  MAX_RETRIES:
    3,

};

function getNotificationPolicies() {

  return notificationPolicies;

}

module.exports = {

  getNotificationPolicies,

};