const userPreferences =
  new Map();

function getUserNotificationPreferences(
  userId
) {

  return (

    userPreferences.get(
      userId
    ) ||

    {

      enabled:
        true,

      marketing:
        true,

      system:
        true,

      game:
        true,

    }

  );

}

function setUserNotificationPreferences({

  userId,

  preferences,

}) {

  userPreferences.set(

    userId,

    preferences

  );

}

module.exports = {

  getUserNotificationPreferences,

  setUserNotificationPreferences,

};