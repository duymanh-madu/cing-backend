const {
  trackEvent,
} = require(
  "../adminAnalyticsService"
);

async function trackOrderCreated({

  order,

}) {

  try {

    await trackEvent({

      event_type:
        "order_created",

      user_id:
        order.user_id,

      event_data: {

        order_id:
          order.id,

        order_code:
          order.order_code,

      },

    });

  } catch (error) {

    console.error(

      "trackOrderCreated error:",

      error.message

    );

  }

}

module.exports = {

  trackOrderCreated,

};