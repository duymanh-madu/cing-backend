const {

  trackUserBehavior,

} = require(
  "../../services/analytics/userBehaviorTrackingService"
);

const {

  trackCampaignAttribution,

} = require(
  "../../services/analytics/campaignAttributionService"
);

/**
 * =====================================================
 * ROUTE ANALYTICS EVENT
 * =====================================================
 */

function routeAnalyticsEvent({

  type,

  payload,

}) {

  /**
   * ===================================================
   * USER BEHAVIOR
   * ===================================================
   */

  if (

    [

      "menu_view",

      "voucher_click",

      "game_play",

      "payment_success",

    ].includes(type)

  ) {

    trackUserBehavior({

      user_id:
        payload.user_id,

      session_id:
        payload.session_id,

      event:
        type,

      metadata:
        payload,

    });

  }

  /**
   * ===================================================
   * CAMPAIGN ATTRIBUTION
   * ===================================================
   */

  if (
    payload.campaign_id
  ) {

    trackCampaignAttribution({

      user_id:
        payload.user_id,

      campaign_id:
        payload.campaign_id,

      source:
        payload.source,

      action:
        type,

    });

  }

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  routeAnalyticsEvent,

};