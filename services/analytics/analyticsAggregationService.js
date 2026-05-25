const {

  getUserBehaviorEvents,

} = require(
  "./userBehaviorTrackingService"
);

/**
 * =====================================================
 * AGGREGATE ANALYTICS
 * =====================================================
 */

function aggregateAnalytics() {

  const events =
    getUserBehaviorEvents();

  const aggregation = {

    total_events:
      events.length,

    menu_views: 0,

    voucher_clicks: 0,

    game_plays: 0,

    payment_success: 0,

  };

  for (
    const item of events
  ) {

    switch (
      item.event
    ) {

      case "menu_view":

        aggregation.menu_views += 1;

        break;

      case "voucher_click":

        aggregation.voucher_clicks += 1;

        break;

      case "game_play":

        aggregation.game_plays += 1;

        break;

      case "payment_success":

        aggregation.payment_success += 1;

        break;

      default:

        break;

    }

  }

  return {

    aggregation,

    generated_at:
      Date.now(),

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  aggregateAnalytics,

};