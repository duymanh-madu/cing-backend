const eventBus =
  require(
    "../eventBus"
  );

const {
  trackEvent,
} = require(
  "../../../services/adminAnalyticsService"
);

eventBus.register(

  "analytics.track",

  async ({
    event_type,
    user_id,
    event_data,
  }) => {

    await trackEvent({

      event_type,
      user_id,
      event_data,

    });

  }

);